package usecase_test

import (
	"testing"
	"time"

	"greenmesh/server/internal/domain"
	"greenmesh/server/internal/repository"
	"greenmesh/server/internal/usecase"
)

type mockMqttPublisher struct {
	nodeCommands     []struct{ NodeID string; Output int }
	actuatorCommands []struct{ Type string; Coil int }
}

func (m *mockMqttPublisher) PublishNodeCommand(nodeID string, output int, _ int64) error {
	m.nodeCommands = append(m.nodeCommands, struct{ NodeID string; Output int }{nodeID, output})
	return nil
}

func (m *mockMqttPublisher) PublishActuatorCommand(actuatorType string, coil int, _ *int) error {
	m.actuatorCommands = append(m.actuatorCommands, struct{ Type string; Coil int }{actuatorType, coil})
	return nil
}

func (m *mockMqttPublisher) PublishConfig(_ domain.SystemConfig) error {
	return nil
}

func (m *mockMqttPublisher) PublishTelemetry(_ domain.Telemetry) error {
	return nil
}

type mockBroadcaster struct {
	events []string
}

func (b *mockBroadcaster) Broadcast(eventType string, _ interface{}) {
	b.events = append(b.events, eventType)
}

func TestEmergencyLowWaterShutdown(t *testing.T) {
	repo := repository.NewMemoryRepository()
	mqttPub := &mockMqttPublisher{}
	broadcaster := &mockBroadcaster{}
	uc := usecase.NewGreenhouseUseCase(repo, mqttPub, broadcaster)

	// Set valves and pump initially ON
	bedA, _ := repo.GetNode(domain.NodeBedA)
	bedA.OutputState = 1
	_ = repo.UpdateNode(bedA)

	pump, _ := repo.GetActuator(domain.ActuatorPump)
	pump.Coil = 1
	_ = repo.UpdateActuator(pump)

	// Simulate utility node reporting water low (digital = 1)
	err := uc.ProcessTelemetry(domain.Telemetry{
		NodeID:    domain.NodeUtility,
		Analog:    50.0,
		Digital:   1, // Water Low!
		Output:    0,
		Seq:       1,
		Timestamp: time.Now(),
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Verify pump is turned OFF
	updatedPump, _ := repo.GetActuator(domain.ActuatorPump)
	if updatedPump.Coil != 0 {
		t.Errorf("expected pump to be turned off, but coil is %d", updatedPump.Coil)
	}

	// Verify Valve A is turned OFF
	updatedBedA, _ := repo.GetNode(domain.NodeBedA)
	if updatedBedA.OutputState != 0 {
		t.Errorf("expected valve A to be closed, but output is %d", updatedBedA.OutputState)
	}

	// Verify danger event was logged
	events := uc.GetEvents(10)
	foundDanger := false
	for _, e := range events {
		if e.Level == domain.EventLevelDanger {
			foundDanger = true
			break
		}
	}
	if !foundDanger {
		t.Errorf("expected DANGER event to be logged upon low water")
	}
}

func TestAutomatedMoistureAndPumpRule(t *testing.T) {
	repo := repository.NewMemoryRepository()
	mqttPub := &mockMqttPublisher{}
	broadcaster := &mockBroadcaster{}
	uc := usecase.NewGreenhouseUseCase(repo, mqttPub, broadcaster)

	// Bed A has low moisture (25% < 35%) and pot present (digital = 1)
	err := uc.ProcessTelemetry(domain.Telemetry{
		NodeID:    domain.NodeBedA,
		Analog:    25.0,
		Digital:   1,
		Output:    0,
		Seq:       1,
		Timestamp: time.Now(),
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Valve A should open
	bedA, _ := repo.GetNode(domain.NodeBedA)
	if bedA.OutputState != 1 {
		t.Errorf("expected Valve A to open, but state is %d", bedA.OutputState)
	}

	// Pump should turn on because Valve A is open
	pump, _ := repo.GetActuator(domain.ActuatorPump)
	if pump.Coil != 1 {
		t.Errorf("expected Pump to turn on when Valve A opened, but coil is %d", pump.Coil)
	}

	// Now moisture increases to 50% (> 45%)
	_ = uc.ProcessTelemetry(domain.Telemetry{
		NodeID:    domain.NodeBedA,
		Analog:    50.0,
		Digital:   1,
		Output:    1,
		Seq:       2,
		Timestamp: time.Now(),
	})

	// Valve A should close
	bedA, _ = repo.GetNode(domain.NodeBedA)
	if bedA.OutputState != 0 {
		t.Errorf("expected Valve A to close, but state is %d", bedA.OutputState)
	}

	// Pump should turn off because no valves are open
	pump, _ = repo.GetActuator(domain.ActuatorPump)
	if pump.Coil != 0 {
		t.Errorf("expected Pump to turn off when all valves closed, but coil is %d", pump.Coil)
	}
}

func TestClimateTemperatureFanRule(t *testing.T) {
	repo := repository.NewMemoryRepository()
	mqttPub := &mockMqttPublisher{}
	broadcaster := &mockBroadcaster{}
	uc := usecase.NewGreenhouseUseCase(repo, mqttPub, broadcaster)

	// Temp rises above 32°C (e.g. 34.5°C)
	_ = uc.ProcessTelemetry(domain.Telemetry{
		NodeID:    domain.NodeClimate,
		Analog:    34.5,
		Digital:   0,
		Output:    0,
		Seq:       1,
		Timestamp: time.Now(),
	})

	climate, _ := repo.GetNode(domain.NodeClimate)
	if climate.OutputState != 1 {
		t.Errorf("expected climate LED to turn on at 34.5°C, got %d", climate.OutputState)
	}

	fan, _ := repo.GetActuator(domain.ActuatorFan)
	if fan.Coil != 1 {
		t.Errorf("expected Fan Modbus slave to turn on, got coil %d", fan.Coil)
	}

	// Temp cools below 30°C (e.g. 29.0°C)
	_ = uc.ProcessTelemetry(domain.Telemetry{
		NodeID:    domain.NodeClimate,
		Analog:    29.0,
		Digital:   0,
		Output:    1,
		Seq:       2,
		Timestamp: time.Now(),
	})

	climate, _ = repo.GetNode(domain.NodeClimate)
	if climate.OutputState != 0 {
		t.Errorf("expected climate LED to turn off at 29.0°C, got %d", climate.OutputState)
	}

	fan, _ = repo.GetActuator(domain.ActuatorFan)
	if fan.Coil != 0 {
		t.Errorf("expected Fan Modbus slave to turn off, got coil %d", fan.Coil)
	}
}

func TestClimateFanRequestButton(t *testing.T) {
	repo := repository.NewMemoryRepository()
	mqttPub := &mockMqttPublisher{}
	broadcaster := &mockBroadcaster{}
	uc := usecase.NewGreenhouseUseCase(repo, mqttPub, broadcaster)

	// Temp is cool (25.0°C < 30.0°C), but fan request button is pressed (Digital: 1)
	_ = uc.ProcessTelemetry(domain.Telemetry{
		NodeID:    domain.NodeClimate,
		Analog:    25.0,
		Digital:   1, // Button pressed
		Output:    0,
		Seq:       1,
		Timestamp: time.Now(),
	})

	climate, _ := repo.GetNode(domain.NodeClimate)
	if climate.OutputState != 1 {
		t.Errorf("expected climate LED to turn on when fan request button pressed, got %d", climate.OutputState)
	}

	fan, _ := repo.GetActuator(domain.ActuatorFan)
	if fan.Coil != 1 {
		t.Errorf("expected Fan Modbus slave to turn on when fan request button pressed, got coil %d", fan.Coil)
	}
}

func TestUpdateConfigPartialThresholdsPreservesModeAndOtherThresholds(t *testing.T) {
	repo := repository.NewMemoryRepository()
	mqttPub := &mockMqttPublisher{}
	broadcaster := &mockBroadcaster{}
	uc := usecase.NewGreenhouseUseCase(repo, mqttPub, broadcaster)

	initialCfg := uc.GetConfig()
	if !initialCfg.AutoMode {
		t.Fatalf("expected initial AutoMode to be true")
	}

	// Update only Bed A thresholds (as BedStationCard sends when clicking 'Save')
	newMin := 28.0
	newMax := 42.0
	updated, err := uc.UpdateConfig(domain.UpdateConfigRequest{
		MoistureAMin: &newMin,
		MoistureAMax: &newMax,
	})
	if err != nil {
		t.Fatalf("unexpected error updating config: %v", err)
	}

	// 1. Bed A thresholds must be updated
	if updated.MoistureAMin != newMin || updated.MoistureAMax != newMax {
		t.Errorf("expected Bed A thresholds (%.1f, %.1f), got (%.1f, %.1f)", newMin, newMax, updated.MoistureAMin, updated.MoistureAMax)
	}

	// 2. AutoMode must NOT be flipped to false (manual mode)
	if !updated.AutoMode {
		t.Errorf("expected AutoMode to remain true, but got false (switched to manual)")
	}

	// 3. Other station thresholds must NOT be zeroed out
	if updated.MoistureBMin != initialCfg.MoistureBMin || updated.MoistureBMax != initialCfg.MoistureBMax {
		t.Errorf("Bed B thresholds were wiped: got (%.1f, %.1f), expected (%.1f, %.1f)", updated.MoistureBMin, updated.MoistureBMax, initialCfg.MoistureBMin, initialCfg.MoistureBMax)
	}
	if updated.TempHigh != initialCfg.TempHigh || updated.TempLow != initialCfg.TempLow {
		t.Errorf("Climate thresholds were wiped: got (%.1f, %.1f), expected (%.1f, %.1f)", updated.TempHigh, updated.TempLow, initialCfg.TempHigh, initialCfg.TempLow)
	}
	if updated.LightMin != initialCfg.LightMin || updated.LightMax != initialCfg.LightMax {
		t.Errorf("Utility thresholds were wiped: got (%.1f, %.1f), expected (%.1f, %.1f)", updated.LightMin, updated.LightMax, initialCfg.LightMin, initialCfg.LightMax)
	}
}

func TestUpdateConfigManualModeTogglePreservesThresholds(t *testing.T) {
	repo := repository.NewMemoryRepository()
	mqttPub := &mockMqttPublisher{}
	broadcaster := &mockBroadcaster{}
	uc := usecase.NewGreenhouseUseCase(repo, mqttPub, broadcaster)

	initialCfg := uc.GetConfig()

	// Switch to manual mode (as ExecutiveHeader does)
	manualMode := false
	updated, err := uc.UpdateConfig(domain.UpdateConfigRequest{
		AutoMode: &manualMode,
	})
	if err != nil {
		t.Fatalf("unexpected error updating config: %v", err)
	}

	if updated.AutoMode != false {
		t.Errorf("expected AutoMode to be false, got true")
	}

	// Verify all thresholds are preserved when entering manual mode
	if updated.MoistureAMin != initialCfg.MoistureAMin || updated.MoistureAMax != initialCfg.MoistureAMax {
		t.Errorf("Bed A thresholds were wiped on manual toggle")
	}
	if updated.TempHigh != initialCfg.TempHigh || updated.TempLow != initialCfg.TempLow {
		t.Errorf("Climate thresholds were wiped on manual toggle")
	}
	if updated.LightMin != initialCfg.LightMin || updated.LightMax != initialCfg.LightMax {
		t.Errorf("Utility thresholds were wiped on manual toggle")
	}

	// While in manual mode, save a threshold (e.g. Climate temp_high: 35)
	newTempHigh := 35.0
	updated2, err := uc.UpdateConfig(domain.UpdateConfigRequest{
		TempHigh: &newTempHigh,
	})
	if err != nil {
		t.Fatalf("unexpected error updating config: %v", err)
	}

	// Must remain in manual mode
	if updated2.AutoMode != false {
		t.Errorf("expected AutoMode to remain false, got %v", updated2.AutoMode)
	}
	if updated2.TempHigh != 35.0 {
		t.Errorf("expected TempHigh to be 35.0, got %.1f", updated2.TempHigh)
	}
	if updated2.MoistureAMin != initialCfg.MoistureAMin {
		t.Errorf("expected MoistureAMin to stay intact, got %.1f", updated2.MoistureAMin)
	}
}
