package handler_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"greenmesh/server/config"
	deliveryHttp "greenmesh/server/internal/delivery/http"
	"greenmesh/server/internal/domain"
	"greenmesh/server/internal/repository"
	"greenmesh/server/internal/simulator"
	"greenmesh/server/internal/usecase"
)

type mockMqttPub struct{}

func (m *mockMqttPub) PublishNodeCommand(_ string, _ int, _ int64) error { return nil }
func (m *mockMqttPub) PublishActuatorCommand(_ string, _ int, _ *int) error { return nil }
func (m *mockMqttPub) PublishConfig(_ domain.SystemConfig) error           { return nil }
func (m *mockMqttPub) PublishTelemetry(_ domain.Telemetry) error          { return nil }

func setupTestApp() (*fiber.App, simulator.Engine, usecase.GreenhouseUseCase) {
	cfg := &config.Config{
		ServerPort:           "8080",
		CorsAllowedOrigins:   "*",
		NodeTimeoutSec:       15,
		SimulatorEnabled:     true,
		SimulatorIntervalSec: 1,
	}

	repo := repository.NewMemoryRepository()
	sse := deliveryHttp.NewSSEBroadcaster()
	mqttClient := &mockMqttPub{}
	uc := usecase.NewGreenhouseUseCase(repo, mqttClient, sse)
	sim := simulator.NewEngine(uc, mqttClient, 1)
	wsHub := deliveryHttp.NewWSHub(uc)

	app := fiber.New()
	deliveryHttp.SetupRoutes(app, cfg, uc, sse, wsHub, sim)

	return app, sim, uc
}

func TestSimulatorEndpoints(t *testing.T) {
	app, sim, uc := setupTestApp()
	sim.Start()
	defer sim.Stop()

	// Wait 50ms for initial tick
	time.Sleep(50 * time.Millisecond)

	// 1. Test GET /api/simulator/status
	req := httptest.NewRequest(http.MethodGet, "/api/simulator/status", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("GET /api/simulator/status failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}

	body, _ := io.ReadAll(resp.Body)
	var simStatus simulator.Status
	if err := json.Unmarshal(body, &simStatus); err != nil {
		t.Fatalf("failed to parse simulator status: %v", err)
	}
	if !simStatus.Running {
		t.Errorf("expected simulator to be running")
	}

	// 2. Test GET /api/status - verify nodes are ONLINE and have readings
	req = httptest.NewRequest(http.MethodGet, "/api/status", nil)
	resp, err = app.Test(req, -1)
	if err != nil {
		t.Fatalf("GET /api/status failed: %v", err)
	}
	var snapshot domain.SystemSnapshot
	body, _ = io.ReadAll(resp.Body)
	_ = json.Unmarshal(body, &snapshot)

	bedA := snapshot.Nodes[domain.NodeBedA]
	if bedA == nil || !bedA.Online {
		t.Errorf("expected Bed A to be online from simulator")
	}

	// 3. Test POST /api/simulator/scenario -> water_low
	scenarioBody := `{"scenario":"water_low"}`
	req = httptest.NewRequest(http.MethodPost, "/api/simulator/scenario", strings.NewReader(scenarioBody))
	req.Header.Set("Content-Type", "application/json")
	resp, err = app.Test(req, -1)
	if err != nil {
		t.Fatalf("POST /api/simulator/scenario failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}

	// Re-check simulator status
	status := sim.GetStatus()
	if !status.WaterLow || status.Scenario != "water_low" {
		t.Errorf("expected water_low scenario to be active")
	}

	// 4. Test POST /api/simulator/stop
	req = httptest.NewRequest(http.MethodPost, "/api/simulator/stop", nil)
	resp, err = app.Test(req, -1)
	if err != nil {
		t.Fatalf("POST /api/simulator/stop failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}
	if sim.IsRunning() {
		t.Errorf("expected simulator to be stopped")
	}

	// 5. Test POST /api/simulator/start
	req = httptest.NewRequest(http.MethodPost, "/api/simulator/start", nil)
	resp, err = app.Test(req, -1)
	if err != nil {
		t.Fatalf("POST /api/simulator/start failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}
	if !sim.IsRunning() {
		t.Errorf("expected simulator to be running again")
	}

	_ = uc
}
