package repository

import (
	"fmt"
	"sync"
	"time"

	"greenmesh/server/internal/domain"
)

const (
	maxTelemetryPointsPerNode = 100
	maxEvents                 = 100
)

type memoryRepository struct {
	mu               sync.RWMutex
	nodes            map[string]*domain.Node
	actuators        map[string]*domain.Actuator
	config           domain.SystemConfig
	telemetryHistory map[string][]domain.TelemetryPoint
	events           []domain.SystemEvent
}

// NewMemoryRepository initializes the repository with default nodes, actuators, and configuration
func NewMemoryRepository() domain.GreenhouseRepository {
	now := time.Now()

	// 4 ESP32 Nodes according to Section 3 of proposal
	nodes := map[string]*domain.Node{
		domain.NodeBedA: {
			ID:           domain.NodeBedA,
			Name:         "แปลงผัก A (Bed A)",
			Description:  "ตรวจความชื้นดินและสถานะกระถางแปลง A พร้อมคุมวาล์ว A",
			AnalogLabel:  "ความชื้นดิน",
			AnalogUnit:   "%",
			AnalogValue:  40.0,
			DigitalLabel: "เซ็นเซอร์กระถาง",
			DigitalValue: 1, // Has pot by default
			OutputLabel:  "วาล์วน้ำ A",
			OutputState:  0, // Closed by default
			Seq:          0,
			Online:       false,
			LastSeen:     now,
		},
		domain.NodeBedB: {
			ID:           domain.NodeBedB,
			Name:         "แปลงผัก B (Bed B)",
			Description:  "ตรวจความชื้นดินและสถานะกระถางแปลง B พร้อมคุมวาล์ว B",
			AnalogLabel:  "ความชื้นดิน",
			AnalogUnit:   "%",
			AnalogValue:  42.0,
			DigitalLabel: "เซ็นเซอร์กระถาง",
			DigitalValue: 1, // Has pot by default
			OutputLabel:  "วาล์วน้ำ B",
			OutputState:  0, // Closed by default
			Seq:          0,
			Online:       false,
			LastSeen:     now,
		},
		domain.NodeClimate: {
			ID:           domain.NodeClimate,
			Name:         "ระบบสภาพอากาศ (Climate)",
			Description:  "ตรวจอุณหภูมิโรงเรือนและปุ่มขอเปิดพัดลม พร้อมแสดงสถานะพัดลม",
			AnalogLabel:  "อุณหภูมิ",
			AnalogUnit:   "°C",
			AnalogValue:  28.5,
			DigitalLabel: "ปุ่มขอเปิดพัดลม",
			DigitalValue: 0,
			OutputLabel:  "พัดลมระบายอากาศ (LED)",
			OutputState:  0,
			Seq:          0,
			Online:       false,
			LastSeen:     now,
		},
		domain.NodeUtility: {
			ID:           domain.NodeUtility,
			Name:         "ระบบน้ำและแสง (Utility & Bridge)",
			Description:  "ตรวจความเข้มแสงและเซ็นเซอร์น้ำต่ำ เป็นสะพานเชื่อม ESP-NOW ถึง MQTT",
			AnalogLabel:  "ความเข้มแสง",
			AnalogUnit:   "%",
			AnalogValue:  65.0,
			DigitalLabel: "เซ็นเซอร์น้ำต่ำในถัง",
			DigitalValue: 0, // 0 = Normal, 1 = Low Water
			OutputLabel:  "ไฟปลูกพืช (LED)",
			OutputState:  0,
			Seq:          0,
			Online:       false,
			LastSeen:     now,
		},
	}

	// 3 Modbus RTU Slaves according to Section 5 of proposal
	actuators := map[string]*domain.Actuator{
		domain.ActuatorPump: {
			ID:             domain.ActuatorPump,
			SlaveID:        1,
			Type:           domain.ActuatorPump,
			Name:           "สถานีปั๊มน้ำ (Pump Station)",
			Coil:           0,
			Mode:           1, // Auto mode
			Target:         0,
			Running:        0,
			SimulatedValue: 0,
			LastUpdated:    now,
		},
		domain.ActuatorFan: {
			ID:             domain.ActuatorFan,
			SlaveID:        2,
			Type:           domain.ActuatorFan,
			Name:           "สถานีพัดลมระบายอากาศ (Fan Station)",
			Coil:           0,
			Mode:           1, // Auto mode
			Target:         30, // Target temp
			Running:        0,
			SimulatedValue: 0,
			LastUpdated:    now,
		},
		domain.ActuatorLight: {
			ID:             domain.ActuatorLight,
			SlaveID:        3,
			Type:           domain.ActuatorLight,
			Name:           "สถานีไฟปลูกพืช (Grow Light Station)",
			Coil:           0,
			Mode:           1, // Auto mode
			Target:         50,
			Running:        0,
			SimulatedValue: 0,
			LastUpdated:    now,
		},
	}

	// Default SystemConfig according to Section 8 of proposal
	cfg := domain.SystemConfig{
		AutoMode:     true,
		MoistureAMin: 35.0,
		MoistureAMax: 45.0,
		MoistureBMin: 35.0,
		MoistureBMax: 45.0,
		TempHigh:     32.0,
		TempLow:      30.0,
		LightMin:     30.0,
		LightMax:     40.0,
		LastModified: now,
	}

	repo := &memoryRepository{
		nodes:            nodes,
		actuators:        actuators,
		config:           cfg,
		telemetryHistory: make(map[string][]domain.TelemetryPoint),
		events:           make([]domain.SystemEvent, 0, maxEvents),
	}

	// Initial event
	repo.AddEvent(domain.SystemEvent{
		ID:        fmt.Sprintf("evt_%d", now.UnixMilli()),
		Timestamp: now,
		Level:     domain.EventLevelInfo,
		Source:    "system",
		Message:   "ระบบเซิร์ฟเวอร์ GreenMesh เริ่มต้นการทำงานพร้อมเชื่อมต่อ Node-RED และ Next.js",
	})

	return repo
}

func (r *memoryRepository) GetNode(id string) (*domain.Node, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	node, exists := r.nodes[id]
	if !exists {
		return nil, fmt.Errorf("node with id '%s' not found", id)
	}

	clone := *node
	return &clone, nil
}

func (r *memoryRepository) GetAllNodes() map[string]*domain.Node {
	r.mu.RLock()
	defer r.mu.RUnlock()

	res := make(map[string]*domain.Node, len(r.nodes))
	for k, v := range r.nodes {
		clone := *v
		res[k] = &clone
	}
	return res
}

func (r *memoryRepository) UpdateNode(node *domain.Node) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.nodes[node.ID]; !exists {
		return fmt.Errorf("node with id '%s' not found", node.ID)
	}

	clone := *node
	r.nodes[node.ID] = &clone
	return nil
}

func (r *memoryRepository) GetActuator(id string) (*domain.Actuator, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	act, exists := r.actuators[id]
	if !exists {
		return nil, fmt.Errorf("actuator with id '%s' not found", id)
	}

	clone := *act
	return &clone, nil
}

func (r *memoryRepository) GetAllActuators() map[string]*domain.Actuator {
	r.mu.RLock()
	defer r.mu.RUnlock()

	res := make(map[string]*domain.Actuator, len(r.actuators))
	for k, v := range r.actuators {
		clone := *v
		res[k] = &clone
	}
	return res
}

func (r *memoryRepository) UpdateActuator(actuator *domain.Actuator) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.actuators[actuator.ID]; !exists {
		return fmt.Errorf("actuator with id '%s' not found", actuator.ID)
	}

	clone := *actuator
	r.actuators[actuator.ID] = &clone
	return nil
}

func (r *memoryRepository) GetConfig() domain.SystemConfig {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.config
}

func (r *memoryRepository) UpdateConfig(cfg domain.SystemConfig) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	cfg.LastModified = time.Now()
	r.config = cfg
	return nil
}

func (r *memoryRepository) AddTelemetryPoint(point domain.TelemetryPoint) {
	r.mu.Lock()
	defer r.mu.Unlock()

	history := r.telemetryHistory[point.NodeID]
	if len(history) >= maxTelemetryPointsPerNode {
		history = history[1:]
	}
	history = append(history, point)
	r.telemetryHistory[point.NodeID] = history
}

func (r *memoryRepository) GetTelemetryHistory(nodeID string, limit int) []domain.TelemetryPoint {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if limit <= 0 || limit > maxTelemetryPointsPerNode {
		limit = maxTelemetryPointsPerNode
	}

	history, exists := r.telemetryHistory[nodeID]
	if !exists {
		return []domain.TelemetryPoint{}
	}

	start := len(history) - limit
	if start < 0 {
		start = 0
	}

	res := make([]domain.TelemetryPoint, len(history)-start)
	copy(res, history[start:])
	return res
}

func (r *memoryRepository) AddEvent(event domain.SystemEvent) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if len(r.events) >= maxEvents {
		r.events = r.events[1:]
	}
	r.events = append(r.events, event)
}

func (r *memoryRepository) GetRecentEvents(limit int) []domain.SystemEvent {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if limit <= 0 || limit > maxEvents {
		limit = maxEvents
	}

	start := len(r.events) - limit
	if start < 0 {
		start = 0
	}

	res := make([]domain.SystemEvent, len(r.events)-start)
	// Return in reverse chronological order (newest first)
	for i, j := len(r.events)-1, 0; i >= start; i, j = i-1, j+1 {
		res[j] = r.events[i]
	}
	return res
}

func (r *memoryRepository) GetSnapshot() domain.SystemSnapshot {
	r.mu.RLock()
	defer r.mu.RUnlock()

	nodes := make(map[string]*domain.Node, len(r.nodes))
	for k, v := range r.nodes {
		clone := *v
		nodes[k] = &clone
	}

	actuators := make(map[string]*domain.Actuator, len(r.actuators))
	for k, v := range r.actuators {
		clone := *v
		actuators[k] = &clone
	}

	// Check if water is low from utility node
	waterLow := false
	if util, ok := r.nodes[domain.NodeUtility]; ok && util.DigitalValue == 1 {
		waterLow = true
	}

	// Recent 20 events (newest first)
	eventCount := 20
	start := len(r.events) - eventCount
	if start < 0 {
		start = 0
	}
	recentEvents := make([]domain.SystemEvent, len(r.events)-start)
	for i, j := len(r.events)-1, 0; i >= start; i, j = i-1, j+1 {
		recentEvents[j] = r.events[i]
	}

	return domain.SystemSnapshot{
		Config:       r.config,
		Nodes:        nodes,
		Actuators:    actuators,
		RecentEvents: recentEvents,
		WaterLow:     waterLow,
		Emergency:    waterLow,
		ServerTime:   time.Now(),
	}
}
