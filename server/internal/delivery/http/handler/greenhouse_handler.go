package handler

import (
	"fmt"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"greenmesh/server/internal/domain"
	"greenmesh/server/internal/simulator"
	"greenmesh/server/internal/usecase"
)

// GreenhouseHandler handles all REST endpoints for the greenhouse dashboard
type GreenhouseHandler struct {
	useCase   usecase.GreenhouseUseCase
	simulator simulator.Engine
}

// NewGreenhouseHandler creates a new GreenhouseHandler
func NewGreenhouseHandler(u usecase.GreenhouseUseCase, sim simulator.Engine) *GreenhouseHandler {
	return &GreenhouseHandler{
		useCase:   u,
		simulator: sim,
	}
}

// GetStatus returns the complete system snapshot
func (h *GreenhouseHandler) GetStatus(c *fiber.Ctx) error {
	snapshot := h.useCase.GetSnapshot()
	return c.JSON(snapshot)
}

// GetNodes returns all ESP32 nodes
func (h *GreenhouseHandler) GetNodes(c *fiber.Ctx) error {
	nodes := h.useCase.GetNodes()
	return c.JSON(nodes)
}

// GetNode returns a single node by ID
func (h *GreenhouseHandler) GetNode(c *fiber.Ctx) error {
	id := c.Params("id")
	node, err := h.useCase.GetNode(id)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": err.Error(),
		})
	}
	return c.JSON(node)
}

// GetActuators returns all RS485 Modbus actuators
func (h *GreenhouseHandler) GetActuators(c *fiber.Ctx) error {
	actuators := h.useCase.GetActuators()
	return c.JSON(actuators)
}

// GetActuator returns a single actuator by type
func (h *GreenhouseHandler) GetActuator(c *fiber.Ctx) error {
	actType := c.Params("type")
	actuator, err := h.useCase.GetActuator(actType)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error": err.Error(),
		})
	}
	return c.JSON(actuator)
}

// GetTelemetryHistory returns time-series points for Next.js charts
func (h *GreenhouseHandler) GetTelemetryHistory(c *fiber.Ctx) error {
	nodeID := c.Query("node_id", domain.NodeBedA)
	limitStr := c.Query("limit", "50")
	limit, err := strconv.Atoi(limitStr)
	if err != nil {
		limit = 50
	}

	history := h.useCase.GetTelemetryHistory(nodeID, limit)
	return c.JSON(history)
}

// GetEvents returns system event history and alerts
func (h *GreenhouseHandler) GetEvents(c *fiber.Ctx) error {
	limitStr := c.Query("limit", "50")
	limit, err := strconv.Atoi(limitStr)
	if err != nil {
		limit = 50
	}

	events := h.useCase.GetEvents(limit)
	return c.JSON(events)
}

// GetConfig returns current auto mode and threshold configuration
func (h *GreenhouseHandler) GetConfig(c *fiber.Ctx) error {
	cfg := h.useCase.GetConfig()
	return c.JSON(cfg)
}

// UpdateConfig updates thresholds and auto/manual mode
func (h *GreenhouseHandler) UpdateConfig(c *fiber.Ctx) error {
	var req domain.UpdateConfigRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid request body",
		})
	}

	updatedConfig, err := h.useCase.UpdateConfig(req)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"config":  updatedConfig,
	})
}

// SendCommand executes a manual control command to an ESP32 output or Modbus actuator
func (h *GreenhouseHandler) SendCommand(c *fiber.Ctx) error {
	var cmd domain.Command
	if err := c.BodyParser(&cmd); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid command body",
		})
	}

	resp, err := h.useCase.SendCommand(cmd)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(resp)
	}

	return c.JSON(resp)
}

// SimulateTelemetry allows manual telemetry injection for development/testing
func (h *GreenhouseHandler) SimulateTelemetry(c *fiber.Ctx) error {
	type SimRequest struct {
		NodeID  string  `json:"node_id"`
		Analog  float64 `json:"analog"`
		Digital int     `json:"digital"`
		Output  int     `json:"output"`
	}

	var req SimRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "invalid simulator request",
		})
	}

	if err := h.useCase.SimulateTelemetry(req.NodeID, req.Analog, req.Digital, req.Output); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "telemetry simulated successfully",
		"node_id": req.NodeID,
	})
}

// GetSimulatorStatus returns the current running status and physical readings of the simulator
func (h *GreenhouseHandler) GetSimulatorStatus(c *fiber.Ctx) error {
	if h.simulator == nil {
		return c.JSON(fiber.Map{
			"running": false,
			"message": "simulator not initialized",
		})
	}
	return c.JSON(h.simulator.GetStatus())
}

// StartSimulator starts the background sensor simulation
func (h *GreenhouseHandler) StartSimulator(c *fiber.Ctx) error {
	if h.simulator == nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "simulator not initialized",
		})
	}
	h.simulator.Start()
	return c.JSON(fiber.Map{
		"success": true,
		"message": "greenhouse sensor simulator started",
		"status":  h.simulator.GetStatus(),
	})
}

// StopSimulator stops the background sensor simulation
func (h *GreenhouseHandler) StopSimulator(c *fiber.Ctx) error {
	if h.simulator == nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "simulator not initialized",
		})
	}
	h.simulator.Stop()
	return c.JSON(fiber.Map{
		"success": true,
		"message": "greenhouse sensor simulator stopped",
		"status":  h.simulator.GetStatus(),
	})
}

// SetSimulatorScenario injects a pre-configured simulation scenario
func (h *GreenhouseHandler) SetSimulatorScenario(c *fiber.Ctx) error {
	if h.simulator == nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "simulator not initialized",
		})
	}

	type ScenarioReq struct {
		Scenario string `json:"scenario"`
	}

	var req ScenarioReq
	if err := c.BodyParser(&req); err != nil || req.Scenario == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "scenario name is required (e.g. normal, water_low, pot_removed, heatwave)",
		})
	}

	if err := h.simulator.SetScenario(req.Scenario); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"success":  true,
		"scenario": req.Scenario,
		"message":  fmt.Sprintf("simulation scenario set to '%s'", req.Scenario),
		"status":   h.simulator.GetStatus(),
	})
}

// ResetSimulator resets the system and simulator to default initial state
func (h *GreenhouseHandler) ResetSimulator(c *fiber.Ctx) error {
	if h.simulator != nil {
		h.simulator.Reset()
	}

	if err := h.useCase.ResetToDefaults(); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"message": "system state reset to defaults",
	})
}

// HealthCheck returns server health
func (h *GreenhouseHandler) HealthCheck(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"status":    "healthy",
		"timestamp": time.Now(),
		"service":   "greenmesh-server",
	})
}
