package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"

	"greenmesh/server/config"
	deliveryHttp "greenmesh/server/internal/delivery/http"
	deliveryMqtt "greenmesh/server/internal/delivery/mqtt"
	"greenmesh/server/internal/repository"
	"greenmesh/server/internal/simulator"
	"greenmesh/server/internal/usecase"
)

func main() {
	log.Println("==================================================")
	log.Println("  🌿 GreenMesh Smart Greenhouse Server (Go Fiber)")
	log.Println("==================================================")

	// 1. Load Configuration
	cfg := config.Load()
	log.Printf("[Config] Port: %s, MQTT Broker: %s:%d, Simulator: %v (%dms)",
		cfg.ServerPort, cfg.MqttBrokerHost, cfg.MqttBrokerPort, cfg.SimulatorEnabled, cfg.SimulatorIntervalMs)

	// 2. Initialize In-Memory Repository
	repo := repository.NewMemoryRepository()

	// 3. Initialize Unified Broadcasters (SSE & WebSocket)
	sseBroadcaster := deliveryHttp.NewSSEBroadcaster()
	compositeBroadcaster := deliveryHttp.NewCompositeBroadcaster(sseBroadcaster)

	// 4. Initialize MQTT Client (for Node-RED and ESP32 communication)
	mqttClient := deliveryMqtt.NewClient(cfg)

	// 5. Initialize Greenhouse UseCase
	greenhouseUseCase := usecase.NewGreenhouseUseCase(repo, mqttClient, compositeBroadcaster)

	// 5.1 Initialize WebSocket Hub and attach to CompositeBroadcaster
	wsHub := deliveryHttp.NewWSHub(greenhouseUseCase)
	compositeBroadcaster.Add(wsHub)

	// 5.2 Initialize Simulator Engine (for automated closed-loop sensor simulation)
	simEngine := simulator.NewEngine(greenhouseUseCase, mqttClient, cfg.SimulatorIntervalMs)
	if cfg.SimulatorEnabled {
		simEngine.Start()
	}

	// 6. Link UseCase back to MQTT Client for callbacks
	mqttClient.SetUseCase(greenhouseUseCase)

	// 7. Connect to MQTT Broker in background (so server starts even if broker starts after)
	go func() {
		for {
			err := mqttClient.Connect()
			if err == nil {
				break
			}
			log.Printf("[MQTT] Retrying MQTT connection in 5 seconds...")
			time.Sleep(5 * time.Second)
		}
	}()

	// 8. Start Watchdog Goroutine (checks node online/offline status)
	watchdogStop := make(chan struct{})
	go func() {
		ticker := time.NewTicker(3 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				greenhouseUseCase.CheckWatchdog(cfg.NodeTimeoutSec)
			case <-watchdogStop:
				return
			}
		}
	}()

	// 9. Initialize Fiber Web App
	app := fiber.New(fiber.Config{
		AppName:      "GreenMesh Smart Greenhouse Server",
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 0, // Set to 0 to support long-lived SSE connections
		IdleTimeout:  120 * time.Second,
	})

	// 10. Register Routes (HTTP REST, SSE Stream, WebSocket Hub)
	deliveryHttp.SetupRoutes(app, cfg, greenhouseUseCase, sseBroadcaster, wsHub, simEngine)

	// 11. Graceful Shutdown Listener
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-sigChan
		log.Println("[Server] Shutting down gracefully...")
		simEngine.Stop()
		close(watchdogStop)
		mqttClient.Disconnect()
		_ = app.Shutdown()
	}()

	// 12. Start HTTP Server
	addr := fmt.Sprintf(":%s", cfg.ServerPort)
	log.Printf("[Server] HTTP & SSE server listening on http://0.0.0.0%s", addr)
	if err := app.Listen(addr); err != nil {
		log.Printf("[Server] Server stopped: %v", err)
	}
}