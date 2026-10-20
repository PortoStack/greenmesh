package usecase

import (
	"fmt"
	"math/rand"
	"sync"
	"time"

	"greenmesh/server/internal/domain"
)

// GreenhouseUseCase defines all business operations for the greenhouse
type GreenhouseUseCase interface {
	ProcessTelemetry(telemetry domain.Telemetry) error
	UpdateNodeState(nodeID string, output int, online bool) error
	UpdateActuatorState(actuator domain.Actuator) error
	RecordAlert(level, source, message string) error

	SendCommand(cmd domain.Command) (domain.CommandResponse, error)

	GetSnapshot() domain.SystemSnapshot
	GetNodes() map[string]*domain.Node
	GetNode(id string) (*domain.Node, error)
	GetActuators() map[string]*domain.Actuator
	GetActuator(id string) (*domain.Actuator, error)
	GetTelemetryHistory(nodeID string, limit int) []domain.TelemetryPoint
	GetEvents(limit int) []domain.SystemEvent
	GetConfig() domain.SystemConfig
	UpdateConfig(req domain.UpdateConfigRequest) (domain.SystemConfig, error)

	CheckWatchdog(timeoutSec int)
	SimulateTelemetry(nodeID string, analog float64, digital int, output int) error
	ResetToDefaults() error
}

type greenhouseUseCase struct {
	repo        domain.GreenhouseRepository
	mqttPub     domain.MqttPublisher
	broadcaster domain.StreamBroadcaster
	ruleMu      sync.Mutex
}

// NewGreenhouseUseCase creates a new instance of GreenhouseUseCase
func NewGreenhouseUseCase(
	repo domain.GreenhouseRepository,
	mqttPub domain.MqttPublisher,
	broadcaster domain.StreamBroadcaster,
) GreenhouseUseCase {
	return &greenhouseUseCase{
		repo:        repo,
		mqttPub:     mqttPub,
		broadcaster: broadcaster,
	}
}

func (u *greenhouseUseCase) ProcessTelemetry(t domain.Telemetry) error {
	node, err := u.repo.GetNode(t.NodeID)
	if err != nil {
		return err
	}

	wasOffline := !node.Online
	node.AnalogValue = t.Analog
	node.DigitalValue = t.Digital
	node.OutputState = t.Output
	node.Seq = t.Seq
	node.Online = true
	node.LastSeen = time.Now()

	if err := u.repo.UpdateNode(node); err != nil {
		return err
	}

	// Record telemetry point for time-series charts
	point := domain.TelemetryPoint{
		NodeID:    t.NodeID,
		Analog:    t.Analog,
		Digital:   t.Digital,
		Output:    t.Output,
		Timestamp: node.LastSeen,
	}
	u.repo.AddTelemetryPoint(point)

	// Broadcast live telemetry point and node update to Next.js SSE
	if u.broadcaster != nil {
		u.broadcaster.Broadcast("telemetry", point)
		u.broadcaster.Broadcast("node", node)
	}

	if wasOffline {
		event := domain.SystemEvent{
			ID:        fmt.Sprintf("evt_%d", time.Now().UnixNano()),
			Timestamp: time.Now(),
			Level:     domain.EventLevelSuccess,
			Source:    node.ID,
			Message:   fmt.Sprintf("โหนด %s เชื่อมต่อออนไลน์แล้ว", node.Name),
		}
		u.repo.AddEvent(event)
		if u.broadcaster != nil {
			u.broadcaster.Broadcast("event", event)
		}
	}

	// Evaluate safety & automation rules
	u.evaluateRules(node)

	return nil
}

func (u *greenhouseUseCase) evaluateRules(changedNode *domain.Node) {
	u.ruleMu.Lock()
	defer u.ruleMu.Unlock()

	cfg := u.repo.GetConfig()
	nodes := u.repo.GetAllNodes()
	actuators := u.repo.GetAllActuators()

	utilNode := nodes[domain.NodeUtility]
	waterLow := utilNode != nil && utilNode.DigitalValue == 1

	// --- 1. Emergency Safety Rule (Section 8: Low water shuts down pump and both valves even in Manual) ---
	if waterLow {
		// Ensure pump is stopped
		if pump, ok := actuators[domain.ActuatorPump]; ok && pump.Coil == 1 {
			pump.Coil = 0
			pump.Running = 0
			_ = u.repo.UpdateActuator(pump)
			if u.mqttPub != nil {
				_ = u.mqttPub.PublishActuatorCommand(domain.ActuatorPump, 0, nil)
			}
			if u.broadcaster != nil {
				u.broadcaster.Broadcast("actuator", pump)
			}
		}

		// Ensure Valve A is closed
		if bedA, ok := nodes[domain.NodeBedA]; ok && bedA.OutputState == 1 {
			bedA.OutputState = 0
			_ = u.repo.UpdateNode(bedA)
			if u.mqttPub != nil {
				_ = u.mqttPub.PublishNodeCommand(domain.NodeBedA, 0, time.Now().UnixMilli())
			}
			if u.broadcaster != nil {
				u.broadcaster.Broadcast("node", bedA)
			}
		}

		// Ensure Valve B is closed
		if bedB, ok := nodes[domain.NodeBedB]; ok && bedB.OutputState == 1 {
			bedB.OutputState = 0
			_ = u.repo.UpdateNode(bedB)
			if u.mqttPub != nil {
				_ = u.mqttPub.PublishNodeCommand(domain.NodeBedB, 0, time.Now().UnixMilli())
			}
			if u.broadcaster != nil {
				u.broadcaster.Broadcast("node", bedB)
			}
		}

		// Record Danger Event if this just happened
		if changedNode != nil && changedNode.ID == domain.NodeUtility && changedNode.DigitalValue == 1 {
			event := domain.SystemEvent{
				ID:        fmt.Sprintf("evt_%d", time.Now().UnixNano()),
				Timestamp: time.Now(),
				Level:     domain.EventLevelDanger,
				Source:    "utility",
				Message:   "🚨 ระดับน้ำในถังต่ำ! ระบบหยุดการทำงานของปั๊มน้ำและปิดวาล์ว A/B อัตโนมัติเพื่อความปลอดภัย",
			}
			u.repo.AddEvent(event)
			if u.broadcaster != nil {
				u.broadcaster.Broadcast("event", event)
			}
		}
		return
	}

	// If AutoMode is disabled, do not run automated threshold logic
	if !cfg.AutoMode {
		return
	}

	now := time.Now()

	// --- 2. Bed A Moisture Rule ---
	if bedA, ok := nodes[domain.NodeBedA]; ok && bedA.Online {
		// Moisture A < min and pot present -> Open Valve A
		if bedA.AnalogValue < cfg.MoistureAMin && bedA.DigitalValue == 1 && bedA.OutputState == 0 {
			bedA.OutputState = 1
			_ = u.repo.UpdateNode(bedA)
			if u.mqttPub != nil {
				_ = u.mqttPub.PublishNodeCommand(domain.NodeBedA, 1, now.UnixMilli())
			}
			event := domain.SystemEvent{
				ID:        fmt.Sprintf("evt_%d", now.UnixNano()),
				Timestamp: now,
				Level:     domain.EventLevelInfo,
				Source:    domain.NodeBedA,
				Message:   fmt.Sprintf("แปลง A ความชื้นต่ำ (%.1f%% < %.1f%%) เปิดวาล์ว A", bedA.AnalogValue, cfg.MoistureAMin),
			}
			u.repo.AddEvent(event)
			if u.broadcaster != nil {
				u.broadcaster.Broadcast("node", bedA)
				u.broadcaster.Broadcast("event", event)
			}
		} else if (bedA.AnalogValue > cfg.MoistureAMax || bedA.DigitalValue == 0) && bedA.OutputState == 1 {
			// Moisture A > max or pot removed -> Close Valve A
			bedA.OutputState = 0
			_ = u.repo.UpdateNode(bedA)
			if u.mqttPub != nil {
				_ = u.mqttPub.PublishNodeCommand(domain.NodeBedA, 0, now.UnixMilli())
			}
			reason := fmt.Sprintf("ความชื้นถึงเกณฑ์ (%.1f%% > %.1f%%)", bedA.AnalogValue, cfg.MoistureAMax)
			if bedA.DigitalValue == 0 {
				reason = "ไม่พบกระถางผัก"
			}
			event := domain.SystemEvent{
				ID:        fmt.Sprintf("evt_%d", now.UnixNano()),
				Timestamp: now,
				Level:     domain.EventLevelInfo,
				Source:    domain.NodeBedA,
				Message:   fmt.Sprintf("แปลง A ปิดวาล์ว A (%s)", reason),
			}
			u.repo.AddEvent(event)
			if u.broadcaster != nil {
				u.broadcaster.Broadcast("node", bedA)
				u.broadcaster.Broadcast("event", event)
			}
		}
	}

	// --- 3. Bed B Moisture Rule ---
	if bedB, ok := nodes[domain.NodeBedB]; ok && bedB.Online {
		// Moisture B < min and pot present -> Open Valve B
		if bedB.AnalogValue < cfg.MoistureBMin && bedB.DigitalValue == 1 && bedB.OutputState == 0 {
			bedB.OutputState = 1
			_ = u.repo.UpdateNode(bedB)
			if u.mqttPub != nil {
				_ = u.mqttPub.PublishNodeCommand(domain.NodeBedB, 1, now.UnixMilli())
			}
			event := domain.SystemEvent{
				ID:        fmt.Sprintf("evt_%d", now.UnixNano()),
				Timestamp: now,
				Level:     domain.EventLevelInfo,
				Source:    domain.NodeBedB,
				Message:   fmt.Sprintf("แปลง B ความชื้นต่ำ (%.1f%% < %.1f%%) เปิดวาล์ว B", bedB.AnalogValue, cfg.MoistureBMin),
			}
			u.repo.AddEvent(event)
			if u.broadcaster != nil {
				u.broadcaster.Broadcast("node", bedB)
				u.broadcaster.Broadcast("event", event)
			}
		} else if (bedB.AnalogValue > cfg.MoistureBMax || bedB.DigitalValue == 0) && bedB.OutputState == 1 {
			// Moisture B > max or pot removed -> Close Valve B
			bedB.OutputState = 0
			_ = u.repo.UpdateNode(bedB)
			if u.mqttPub != nil {
				_ = u.mqttPub.PublishNodeCommand(domain.NodeBedB, 0, now.UnixMilli())
			}
			reason := fmt.Sprintf("ความชื้นถึงเกณฑ์ (%.1f%% > %.1f%%)", bedB.AnalogValue, cfg.MoistureBMax)
			if bedB.DigitalValue == 0 {
				reason = "ไม่พบกระถางผัก"
			}
			event := domain.SystemEvent{
				ID:        fmt.Sprintf("evt_%d", now.UnixNano()),
				Timestamp: now,
				Level:     domain.EventLevelInfo,
				Source:    domain.NodeBedB,
				Message:   fmt.Sprintf("แปลง B ปิดวาล์ว B (%s)", reason),
			}
			u.repo.AddEvent(event)
			if u.broadcaster != nil {
				u.broadcaster.Broadcast("node", bedB)
				u.broadcaster.Broadcast("event", event)
			}
		}
	}

	// --- 4. Pump Coordination (Section 8: Any valve open -> Pump ON; No valve open -> Pump OFF) ---
	if pump, ok := actuators[domain.ActuatorPump]; ok {
		bedAOutput := 0
		if bedA, exists := nodes[domain.NodeBedA]; exists {
			bedAOutput = bedA.OutputState
		}
		bedBOutput := 0
		if bedB, exists := nodes[domain.NodeBedB]; exists {
			bedBOutput = bedB.OutputState
		}

		anyValveOpen := (bedAOutput == 1 || bedBOutput == 1)

		if anyValveOpen && pump.Coil == 0 {
			pump.Coil = 1
			pump.Running = 1
			pump.LastUpdated = now
			_ = u.repo.UpdateActuator(pump)
			if u.mqttPub != nil {
				_ = u.mqttPub.PublishActuatorCommand(domain.ActuatorPump, 1, nil)
			}
			event := domain.SystemEvent{
				ID:        fmt.Sprintf("evt_%d", now.UnixNano()),
				Timestamp: now,
				Level:     domain.EventLevelSuccess,
				Source:    domain.ActuatorPump,
				Message:   "พบวาล์วเปิดทำงาน สั่งเปิดปั๊มน้ำ (Modbus Slave 1) อัตโนมัติ",
			}
			u.repo.AddEvent(event)
			if u.broadcaster != nil {
				u.broadcaster.Broadcast("actuator", pump)
				u.broadcaster.Broadcast("event", event)
			}
		} else if !anyValveOpen && pump.Coil == 1 {
			pump.Coil = 0
			pump.Running = 0
			pump.LastUpdated = now
			_ = u.repo.UpdateActuator(pump)
			if u.mqttPub != nil {
				_ = u.mqttPub.PublishActuatorCommand(domain.ActuatorPump, 0, nil)
			}
			event := domain.SystemEvent{
				ID:        fmt.Sprintf("evt_%d", now.UnixNano()),
				Timestamp: now,
				Level:     domain.EventLevelInfo,
				Source:    domain.ActuatorPump,
				Message:   "ไม่มีวาล์วเปิดทำงาน สั่งปิดปั๊มน้ำ (Modbus Slave 1) อัตโนมัติ",
			}
			u.repo.AddEvent(event)
			if u.broadcaster != nil {
				u.broadcaster.Broadcast("actuator", pump)
				u.broadcaster.Broadcast("event", event)
			}
		}
	}

	// --- 5. Climate Temperature & Fan Rule (Section 8: Temp > 32°C -> ON; Temp < 30°C -> OFF) ---
	if climateNode, ok := nodes[domain.NodeClimate]; ok && climateNode.Online {
		fanActuator := actuators[domain.ActuatorFan]

		if climateNode.DigitalValue == 1 {
			// Manual fan request pulse from ESP32 button (Section 8)
			if fanActuator != nil && fanActuator.Coil == 0 {
				fanActuator.Coil = 1
				fanActuator.Running = 1
				fanActuator.LastUpdated = now
				_ = u.repo.UpdateActuator(fanActuator)
				if u.mqttPub != nil {
					_ = u.mqttPub.PublishActuatorCommand(domain.ActuatorFan, 1, nil)
				}
				if u.broadcaster != nil {
					u.broadcaster.Broadcast("actuator", fanActuator)
				}
			}
			if climateNode.OutputState == 0 {
				climateNode.OutputState = 1
				_ = u.repo.UpdateNode(climateNode)
				if u.mqttPub != nil {
					_ = u.mqttPub.PublishNodeCommand(domain.NodeClimate, 1, now.UnixMilli())
				}
				event := domain.SystemEvent{
					ID:        fmt.Sprintf("evt_%d", now.UnixNano()),
					Timestamp: now,
					Level:     domain.EventLevelInfo,
					Source:    domain.NodeClimate,
					Message:   "ได้รับคำขอเปิดพัดลมเฉพาะจุดจากปุ่มกดบนบอร์ด ESP32 (Fan Request Pulse)",
				}
				u.repo.AddEvent(event)
				if u.broadcaster != nil {
					u.broadcaster.Broadcast("node", climateNode)
					u.broadcaster.Broadcast("event", event)
				}
			}
		} else if climateNode.AnalogValue > cfg.TempHigh {
			if fanActuator != nil && fanActuator.Coil == 0 {
				fanActuator.Coil = 1
				fanActuator.Running = 1
				fanActuator.LastUpdated = now
				_ = u.repo.UpdateActuator(fanActuator)
				if u.mqttPub != nil {
					_ = u.mqttPub.PublishActuatorCommand(domain.ActuatorFan, 1, nil)
				}
				if u.broadcaster != nil {
					u.broadcaster.Broadcast("actuator", fanActuator)
				}
			}
			if climateNode.OutputState == 0 {
				climateNode.OutputState = 1
				_ = u.repo.UpdateNode(climateNode)
				if u.mqttPub != nil {
					_ = u.mqttPub.PublishNodeCommand(domain.NodeClimate, 1, now.UnixMilli())
				}
				event := domain.SystemEvent{
					ID:        fmt.Sprintf("evt_%d", now.UnixNano()),
					Timestamp: now,
					Level:     domain.EventLevelWarning,
					Source:    domain.NodeClimate,
					Message:   fmt.Sprintf("อุณหภูมิสูง (%.1f°C > %.1f°C) สั่งเปิดพัดลมระบายอากาศ", climateNode.AnalogValue, cfg.TempHigh),
				}
				u.repo.AddEvent(event)
				if u.broadcaster != nil {
					u.broadcaster.Broadcast("node", climateNode)
					u.broadcaster.Broadcast("event", event)
				}
			}
		} else if climateNode.AnalogValue < cfg.TempLow {
			if fanActuator != nil && fanActuator.Coil == 1 {
				fanActuator.Coil = 0
				fanActuator.Running = 0
				fanActuator.LastUpdated = now
				_ = u.repo.UpdateActuator(fanActuator)
				if u.mqttPub != nil {
					_ = u.mqttPub.PublishActuatorCommand(domain.ActuatorFan, 0, nil)
				}
				if u.broadcaster != nil {
					u.broadcaster.Broadcast("actuator", fanActuator)
				}
			}
			if climateNode.OutputState == 1 {
				climateNode.OutputState = 0
				_ = u.repo.UpdateNode(climateNode)
				if u.mqttPub != nil {
					_ = u.mqttPub.PublishNodeCommand(domain.NodeClimate, 0, now.UnixMilli())
				}
				event := domain.SystemEvent{
					ID:        fmt.Sprintf("evt_%d", now.UnixNano()),
					Timestamp: now,
					Level:     domain.EventLevelInfo,
					Source:    domain.NodeClimate,
					Message:   fmt.Sprintf("อุณหภูมิลดลงสู่เกณฑ์ปกติ (%.1f°C < %.1f°C) สั่งปิดพัดลมระบายอากาศ", climateNode.AnalogValue, cfg.TempLow),
				}
				u.repo.AddEvent(event)
				if u.broadcaster != nil {
					u.broadcaster.Broadcast("node", climateNode)
					u.broadcaster.Broadcast("event", event)
				}
			}
		}
	}

	// --- 6. Utility Light Rule (Section 8: Light < 30% -> ON; Light > 40% -> OFF) ---
	if utilNode != nil && utilNode.Online {
		lightActuator := actuators[domain.ActuatorLight]

		if utilNode.AnalogValue < cfg.LightMin {
			if lightActuator != nil && lightActuator.Coil == 0 {
				lightActuator.Coil = 1
				lightActuator.Running = 1
				lightActuator.LastUpdated = now
				_ = u.repo.UpdateActuator(lightActuator)
				if u.mqttPub != nil {
					_ = u.mqttPub.PublishActuatorCommand(domain.ActuatorLight, 1, nil)
				}
				if u.broadcaster != nil {
					u.broadcaster.Broadcast("actuator", lightActuator)
				}
			}
			if utilNode.OutputState == 0 {
				utilNode.OutputState = 1
				_ = u.repo.UpdateNode(utilNode)
				if u.mqttPub != nil {
					_ = u.mqttPub.PublishNodeCommand(domain.NodeUtility, 1, now.UnixMilli())
				}
				event := domain.SystemEvent{
					ID:        fmt.Sprintf("evt_%d", now.UnixNano()),
					Timestamp: now,
					Level:     domain.EventLevelInfo,
					Source:    domain.NodeUtility,
					Message:   fmt.Sprintf("แสงสว่างต่ำ (%.1f%% < %.1f%%) สั่งเปิดไฟปลูกพืช (Grow Light)", utilNode.AnalogValue, cfg.LightMin),
				}
				u.repo.AddEvent(event)
				if u.broadcaster != nil {
					u.broadcaster.Broadcast("node", utilNode)
					u.broadcaster.Broadcast("event", event)
				}
			}
		} else if utilNode.AnalogValue > cfg.LightMax {
			if lightActuator != nil && lightActuator.Coil == 1 {
				lightActuator.Coil = 0
				lightActuator.Running = 0
				lightActuator.LastUpdated = now
				_ = u.repo.UpdateActuator(lightActuator)
				if u.mqttPub != nil {
					_ = u.mqttPub.PublishActuatorCommand(domain.ActuatorLight, 0, nil)
				}
				if u.broadcaster != nil {
					u.broadcaster.Broadcast("actuator", lightActuator)
				}
			}
			if utilNode.OutputState == 1 {
				utilNode.OutputState = 0
				_ = u.repo.UpdateNode(utilNode)
				if u.mqttPub != nil {
					_ = u.mqttPub.PublishNodeCommand(domain.NodeUtility, 0, now.UnixMilli())
				}
				event := domain.SystemEvent{
					ID:        fmt.Sprintf("evt_%d", now.UnixNano()),
					Timestamp: now,
					Level:     domain.EventLevelInfo,
					Source:    domain.NodeUtility,
					Message:   fmt.Sprintf("แสงสว่างเพียงพอ (%.1f%% > %.1f%%) สั่งปิดไฟปลูกพืช", utilNode.AnalogValue, cfg.LightMax),
				}
				u.repo.AddEvent(event)
				if u.broadcaster != nil {
					u.broadcaster.Broadcast("node", utilNode)
					u.broadcaster.Broadcast("event", event)
				}
			}
		}
	}
}

func (u *greenhouseUseCase) UpdateNodeState(nodeID string, output int, online bool) error {
	node, err := u.repo.GetNode(nodeID)
	if err != nil {
		return err
	}

	node.OutputState = output
	node.Online = online
	node.LastSeen = time.Now()

	if err := u.repo.UpdateNode(node); err != nil {
		return err
	}

	if u.broadcaster != nil {
		u.broadcaster.Broadcast("node", node)
	}
	return nil
}

func (u *greenhouseUseCase) UpdateActuatorState(act domain.Actuator) error {
	existing, err := u.repo.GetActuator(act.ID)
	if err != nil {
		return err
	}

	existing.Coil = act.Coil
	existing.Mode = act.Mode
	existing.Target = act.Target
	existing.Running = act.Running
	existing.SimulatedValue = act.SimulatedValue
	existing.LastUpdated = time.Now()

	if err := u.repo.UpdateActuator(existing); err != nil {
		return err
	}

	if u.broadcaster != nil {
		u.broadcaster.Broadcast("actuator", existing)
	}
	return nil
}

func (u *greenhouseUseCase) RecordAlert(level, source, message string) error {
	event := domain.SystemEvent{
		ID:        fmt.Sprintf("evt_%d", time.Now().UnixNano()),
		Timestamp: time.Now(),
		Level:     level,
		Source:    source,
		Message:   message,
	}
	u.repo.AddEvent(event)
	if u.broadcaster != nil {
		u.broadcaster.Broadcast("event", event)
	}
	return nil
}

func (u *greenhouseUseCase) SendCommand(cmd domain.Command) (domain.CommandResponse, error) {
	now := time.Now()
	cmdID := now.UnixMilli()

	// Safety check: Cannot open valve or run pump if water is low!
	if (cmd.TargetType == "actuator" && cmd.TargetID == domain.ActuatorPump && cmd.Output == 1) ||
		(cmd.TargetType == "node" && (cmd.TargetID == domain.NodeBedA || cmd.TargetID == domain.NodeBedB) && cmd.Output == 1) {
		utilNode, err := u.repo.GetNode(domain.NodeUtility)
		if err == nil && utilNode.DigitalValue == 1 {
			return domain.CommandResponse{
				Success:   false,
				Message:   "ไม่อนุญาตให้เปิดปั๊มหรือวาล์วน้ำเนื่องจากน้ำในถังต่ำ (Low Water Alarm)",
				CommandID: cmdID,
				Timestamp: now,
			}, fmt.Errorf("cannot activate water equipment while water level is low")
		}
	}

	if cmd.TargetType == "node" {
		node, err := u.repo.GetNode(cmd.TargetID)
		if err != nil {
			return domain.CommandResponse{Success: false, Message: err.Error()}, err
		}

		if u.mqttPub != nil {
			if err := u.mqttPub.PublishNodeCommand(cmd.TargetID, cmd.Output, cmdID); err != nil {
				return domain.CommandResponse{Success: false, Message: err.Error()}, err
			}
		}

		node.OutputState = cmd.Output
		_ = u.repo.UpdateNode(node)

		action := "ปิด"
		if cmd.Output == 1 {
			action = "เปิด"
		}
		event := domain.SystemEvent{
			ID:        fmt.Sprintf("cmd_%d", cmdID),
			Timestamp: now,
			Level:     domain.EventLevelInfo,
			Source:    cmd.TargetID,
			Message:   fmt.Sprintf("คำสั่งผู้ใช้ (Manual): %s %s", action, node.OutputLabel),
		}
		u.repo.AddEvent(event)

		if u.broadcaster != nil {
			u.broadcaster.Broadcast("node", node)
			u.broadcaster.Broadcast("event", event)
		}

		return domain.CommandResponse{
			Success:   true,
			Message:   fmt.Sprintf("ส่งคำสั่ง %s โหนด %s เรียบร้อย", action, node.Name),
			CommandID: cmdID,
			Timestamp: now,
		}, nil
	}

	if cmd.TargetType == "actuator" {
		act, err := u.repo.GetActuator(cmd.TargetID)
		if err != nil {
			return domain.CommandResponse{Success: false, Message: err.Error()}, err
		}

		if u.mqttPub != nil {
			if err := u.mqttPub.PublishActuatorCommand(cmd.TargetID, cmd.Output, cmd.Mode); err != nil {
				return domain.CommandResponse{Success: false, Message: err.Error()}, err
			}
		}

		act.Coil = cmd.Output
		act.Running = cmd.Output
		if cmd.Mode != nil {
			act.Mode = *cmd.Mode
		}
		act.LastUpdated = now
		_ = u.repo.UpdateActuator(act)

		action := "ปิด"
		if cmd.Output == 1 {
			action = "เปิด"
		}
		event := domain.SystemEvent{
			ID:        fmt.Sprintf("cmd_%d", cmdID),
			Timestamp: now,
			Level:     domain.EventLevelInfo,
			Source:    cmd.TargetID,
			Message:   fmt.Sprintf("คำสั่งผู้ใช้ (Manual): %s %s", action, act.Name),
		}
		u.repo.AddEvent(event)

		if u.broadcaster != nil {
			u.broadcaster.Broadcast("actuator", act)
			u.broadcaster.Broadcast("event", event)
		}

		return domain.CommandResponse{
			Success:   true,
			Message:   fmt.Sprintf("ส่งคำสั่ง %s สถานี %s เรียบร้อย", action, act.Name),
			CommandID: cmdID,
			Timestamp: now,
		}, nil
	}

	return domain.CommandResponse{Success: false, Message: "invalid target_type"}, fmt.Errorf("invalid target_type: %s", cmd.TargetType)
}

func (u *greenhouseUseCase) GetSnapshot() domain.SystemSnapshot {
	return u.repo.GetSnapshot()
}

func (u *greenhouseUseCase) GetNodes() map[string]*domain.Node {
	return u.repo.GetAllNodes()
}

func (u *greenhouseUseCase) GetNode(id string) (*domain.Node, error) {
	return u.repo.GetNode(id)
}

func (u *greenhouseUseCase) GetActuators() map[string]*domain.Actuator {
	return u.repo.GetAllActuators()
}

func (u *greenhouseUseCase) GetActuator(id string) (*domain.Actuator, error) {
	return u.repo.GetActuator(id)
}

func (u *greenhouseUseCase) GetTelemetryHistory(nodeID string, limit int) []domain.TelemetryPoint {
	return u.repo.GetTelemetryHistory(nodeID, limit)
}

func (u *greenhouseUseCase) GetEvents(limit int) []domain.SystemEvent {
	return u.repo.GetRecentEvents(limit)
}

func (u *greenhouseUseCase) GetConfig() domain.SystemConfig {
	return u.repo.GetConfig()
}

func (u *greenhouseUseCase) UpdateConfig(req domain.UpdateConfigRequest) (domain.SystemConfig, error) {
	current := u.repo.GetConfig()
	modeChanged, thresholdChanged := req.ApplyTo(&current)
	if !modeChanged && !thresholdChanged {
		return current, nil
	}

	current.LastModified = time.Now()
	if err := u.repo.UpdateConfig(current); err != nil {
		return current, err
	}

	if u.mqttPub != nil {
		_ = u.mqttPub.PublishConfig(current)
	}

	var msg string
	if modeChanged && thresholdChanged {
		modeStr := "Auto (อัตโนมัติ)"
		if !current.AutoMode {
			modeStr = "Manual (กำหนดเอง)"
		}
		msg = fmt.Sprintf("ปรับเปลี่ยนการตั้งค่าระบบ: โหมด %s และอัปเดตค่าเกณฑ์", modeStr)
	} else if modeChanged {
		modeStr := "Auto (อัตโนมัติ)"
		if !current.AutoMode {
			modeStr = "Manual (กำหนดเอง)"
		}
		msg = fmt.Sprintf("ปรับเปลี่ยนการตั้งค่าระบบ: โหมด %s", modeStr)
	} else {
		msg = "ปรับเปลี่ยนเกณฑ์การทำงานอัตโนมัติ (Station Thresholds Updated)"
	}

	event := domain.SystemEvent{
		ID:        fmt.Sprintf("cfg_%d", time.Now().UnixNano()),
		Timestamp: time.Now(),
		Level:     domain.EventLevelInfo,
		Source:    "system",
		Message:   msg,
	}
	u.repo.AddEvent(event)

	if u.broadcaster != nil {
		u.broadcaster.Broadcast("config", current)
		u.broadcaster.Broadcast("event", event)
	}

	// Trigger rule re-evaluation with updated thresholds
	u.evaluateRules(nil)

	return current, nil
}

func (u *greenhouseUseCase) CheckWatchdog(timeoutSec int) {
	nodes := u.repo.GetAllNodes()
	now := time.Now()
	threshold := time.Duration(timeoutSec) * time.Second

	for _, node := range nodes {
		if node.Online && now.Sub(node.LastSeen) > threshold {
			node.Online = false
			_ = u.repo.UpdateNode(node)

			event := domain.SystemEvent{
				ID:        fmt.Sprintf("evt_%d", now.UnixNano()),
				Timestamp: now,
				Level:     domain.EventLevelWarning,
				Source:    node.ID,
				Message:   fmt.Sprintf("⚠️ ขาดการเชื่อมต่อกับโหนด %s เกินกว่า %d วินาที (Offline)", node.Name, timeoutSec),
			}
			u.repo.AddEvent(event)

			if u.broadcaster != nil {
				u.broadcaster.Broadcast("node", node)
				u.broadcaster.Broadcast("event", event)
			}
		}
	}
}

func (u *greenhouseUseCase) SimulateTelemetry(nodeID string, analog float64, digital int, output int) error {
	return u.ProcessTelemetry(domain.Telemetry{
		NodeID:    nodeID,
		Analog:    analog,
		Digital:   digital,
		Output:    output,
		Seq:       time.Now().Unix(),
		Timestamp: time.Now(),
	})
}

func (u *greenhouseUseCase) ResetToDefaults() error {
	now := time.Now()
	nodes := u.repo.GetAllNodes()
	for _, n := range nodes {
		n.OutputState = 0
		n.Online = true
		n.LastSeen = now
		if n.ID == domain.NodeBedA {
			n.AnalogValue = 40.0 + rand.Float64()*5.0
			n.DigitalValue = 1
		} else if n.ID == domain.NodeBedB {
			n.AnalogValue = 42.0 + rand.Float64()*5.0
			n.DigitalValue = 1
		} else if n.ID == domain.NodeClimate {
			n.AnalogValue = 28.0 + rand.Float64()*3.0
			n.DigitalValue = 0
		} else if n.ID == domain.NodeUtility {
			n.AnalogValue = 60.0 + rand.Float64()*10.0
			n.DigitalValue = 0
		}
		_ = u.repo.UpdateNode(n)
	}

	actuators := u.repo.GetAllActuators()
	for _, a := range actuators {
		a.Coil = 0
		a.Running = 0
		a.LastUpdated = now
		_ = u.repo.UpdateActuator(a)
	}

	event := domain.SystemEvent{
		ID:        fmt.Sprintf("rst_%d", now.UnixNano()),
		Timestamp: now,
		Level:     domain.EventLevelInfo,
		Source:    "system",
		Message:   "รีเซ็ตสถานะระบบกลับสู่ค่าเริ่มต้นสำหรับการทดสอบ",
	}
	u.repo.AddEvent(event)

	if u.broadcaster != nil {
		u.broadcaster.Broadcast("snapshot", u.repo.GetSnapshot())
	}
	return nil
}
