.PHONY: help build build-server build-client build-no-cache up up-build up-iot down restart logs logs-server logs-client logs-mqtt logs-nodered ps clean client-dev client-build client-install server-dev server-build server-test firmware-build firmware-build-master firmware-clean

# Default target
.DEFAULT_GOAL := help

# Colors for terminal output
CYAN   := \033[36m
GREEN  := \033[32m
YELLOW := \033[33m
RESET  := \033[0m

help: ## Show this help message
	@echo "$(CYAN)GreenMesh - Docker & Development Commands$(RESET)"
	@echo "Usage: make $(GREEN)<target>$(RESET)"
	@echo ""
	@echo "$(YELLOW)Docker Management:$(RESET)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-18s$(RESET) %s\n", $$1, $$2}'

# --- Docker Compose Commands ---

build: ## Build all Docker images (Client, Server, etc.)
	docker compose build

build-server: ## Build only the Golang Fiber server image
	docker compose build server

build-client: ## Build only the Next.js client image
	docker compose build client

build-no-cache: ## Build all Docker images without cache
	docker compose build --no-cache

up: ## Start all containers in detached mode
	docker compose up -d

up-build: ## Build images and start all containers in detached mode
	docker compose up -d --build

down: ## Stop and remove all containers and networks
	docker compose down

restart: ## Restart all containers
	docker compose restart

restart-server: ## Restart only the Golang Fiber server
	docker compose restart server

restart-client: ## Restart only the Next.js client
	docker compose restart client

logs: ## View real-time logs for all containers
	docker compose logs -f

logs-server: ## View real-time logs for Golang Fiber server
	docker compose logs -f server

logs-client: ## View real-time logs for Next.js client
	docker compose logs -f client

logs-mqtt: ## View real-time logs for MQTT Broker
	docker compose logs -f mqtt-broker

logs-nodered: ## View real-time logs for Node-RED
	docker compose logs -f node-red

ps: ## List running containers and status
	docker compose ps

clean: ## Stop containers, remove volumes and orphaned containers
	docker compose down -v --remove-orphans

# --- Local Development Commands ---

client-install: ## Install client npm dependencies
	cd client && npm install

client-dev: ## Run Next.js client in local development mode
	cd client && npm run dev

client-build: ## Build Next.js client locally
	cd client && npm run build

server-dev: ## Run Golang Fiber server locally
	cd server && go run ./cmd/api

server-build: ## Build Golang Fiber binary locally
	cd server && CGO_ENABLED=0 go build -o bin/server ./cmd/api

server-test: ## Run Golang server unit tests
	cd server && go test -v ./...

# --- IoT & Firmware Commands ---

up-iot: ## Start only MQTT Broker and Node-RED containers
	docker compose up -d mqtt-broker node-red

firmware-build: ## Build all 4 ESP32 firmware binaries using PlatformIO
	@which pio > /dev/null 2>&1 && PIO=pio || PIO=$$HOME/.platformio/penv/bin/pio; \
	for dir in firmware/esp_*; do \
		echo "Building $$dir..."; \
		$$PIO run -d "$$dir" || exit 1; \
	done

firmware-build-master: ## Build only Master Gateway Node firmware
	@which pio > /dev/null 2>&1 && PIO=pio || PIO=$$HOME/.platformio/penv/bin/pio; \
	$$PIO run -d firmware/esp_master_node

firmware-clean: ## Clean PlatformIO build cache for all nodes
	@which pio > /dev/null 2>&1 && PIO=pio || PIO=$$HOME/.platformio/penv/bin/pio; \
	for dir in firmware/esp_*; do \
		echo "Cleaning $$dir..."; \
		$$PIO run -d "$$dir" -t clean; \
	done
