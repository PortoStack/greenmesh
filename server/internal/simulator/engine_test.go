package simulator_test

import (
	"testing"
	"time"

	"greenmesh/server/internal/domain"
	"greenmesh/server/internal/repository"
	"greenmesh/server/internal/simulator"
	"greenmesh/server/internal/usecase"
)

type mockMqttPublisher struct{}

func (m *mockMqttPublisher) PublishNodeCommand(_ string, _ int, _ int64) error { return nil }
func (m *mockMqttPublisher) PublishActuatorCommand(_ string, _ int, _ *int) error { return nil }
func (m *mockMqttPublisher) PublishConfig(_ domain.SystemConfig) error           { return nil }
func (m *mockMqttPublisher) PublishTelemetry(_ domain.Telemetry) error          { return nil }

type mockBroadcaster struct{}

func (b *mockBroadcaster) Broadcast(_ string, _ interface{}) {}

func TestSimulatorEngineLifecycle(t *testing.T) {
	repo := repository.NewMemoryRepository()
	mqttPub := &mockMqttPublisher{}
	broadcaster := &mockBroadcaster{}
	uc := usecase.NewGreenhouseUseCase(repo, mqttPub, broadcaster)

	eng := simulator.NewEngine(uc, mqttPub, 1)
	if eng.IsRunning() {
		t.Errorf("expected engine to not be running initially")
	}

	eng.Start()
	if !eng.IsRunning() {
		t.Errorf("expected engine to be running after Start()")
	}

	// Wait for tick to execute
	time.Sleep(50 * time.Millisecond)

	status := eng.GetStatus()
	if !status.Running {
		t.Errorf("expected status.Running to be true")
	}

	// Verify nodes became online
	nodes := uc.GetNodes()
	bedA := nodes[domain.NodeBedA]
	if bedA == nil || !bedA.Online {
		t.Errorf("expected bed_a node to be online after simulator tick")
	}

	// Test scenario switching
	err := eng.SetScenario("water_low")
	if err != nil {
		t.Fatalf("unexpected error setting scenario: %v", err)
	}

	status = eng.GetStatus()
	if !status.WaterLow || status.Scenario != "water_low" {
		t.Errorf("expected water_low to be active")
	}

	// Test invalid scenario
	err = eng.SetScenario("invalid_scenario_123")
	if err == nil {
		t.Errorf("expected error for invalid scenario")
	}

	eng.Stop()
	if eng.IsRunning() {
		t.Errorf("expected engine to be stopped after Stop()")
	}
}
