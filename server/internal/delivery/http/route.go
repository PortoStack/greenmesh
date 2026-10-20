package http

import (
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/websocket/v2"

	"greenmesh/server/config"
	"greenmesh/server/internal/delivery/http/handler"
	"greenmesh/server/internal/simulator"
	"greenmesh/server/internal/usecase"
)

// SetupRoutes registers all HTTP, SSE, and WebSocket routes on the Fiber application
func SetupRoutes(
	app *fiber.App,
	cfg *config.Config,
	useCase usecase.GreenhouseUseCase,
	sse *SSEBroadcaster,
	wsHub *WSHub,
	sim simulator.Engine,
) {
	// Middleware
	app.Use(recover.New())
	app.Use(logger.New(logger.Config{
		Format: "[${time}] ${status} - ${latency} ${method} ${path}\n",
	}))
	app.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.CorsAllowedOrigins,
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization",
		AllowMethods:     "GET, POST, PUT, DELETE, OPTIONS",
		AllowCredentials: false,
	}))

	// API routes group
	api := app.Group("/api")

	h := handler.NewGreenhouseHandler(useCase, sim)

	// Health check (support both root /health and /api/health)
	app.Get("/health", h.HealthCheck)
	api.Get("/health", h.HealthCheck)

	// WebSocket full-duplex stream & command endpoint
	if wsHub != nil {
		app.Use("/api/ws", func(c *fiber.Ctx) error {
			if websocket.IsWebSocketUpgrade(c) {
				c.Locals("allowed", true)
				return c.Next()
			}
			return fiber.ErrUpgradeRequired
		})
		api.Get("/ws", websocket.New(wsHub.HandleWS))
	}

	// Server-Sent Events (SSE) stream for real-time Next.js updates
	api.Get("/stream", sse.HandleSSE(useCase))

	// Greenhouse Status & Snapshot
	api.Get("/status", h.GetStatus)

	// ESP32 Nodes
	api.Get("/nodes", h.GetNodes)
	api.Get("/nodes/:id", h.GetNode)

	// RS485 Modbus Actuators
	api.Get("/actuators", h.GetActuators)
	api.Get("/actuators/:type", h.GetActuator)

	// Telemetry history for charts
	api.Get("/telemetry/history", h.GetTelemetryHistory)

	// Event logs and alerts
	api.Get("/events", h.GetEvents)

	// Thresholds and Auto/Manual configuration
	api.Get("/config", h.GetConfig)
	api.Put("/config", h.UpdateConfig)

	// Manual commands (ESP32 outputs and Modbus actuators)
	api.Post("/commands", h.SendCommand)

	// Simulation and test endpoints
	api.Get("/simulator/status", h.GetSimulatorStatus)
	api.Post("/simulator/start", h.StartSimulator)
	api.Post("/simulator/stop", h.StopSimulator)
	api.Post("/simulator/scenario", h.SetSimulatorScenario)
	api.Post("/simulator/telemetry", h.SimulateTelemetry)
	api.Post("/simulator/reset", h.ResetSimulator)
}
