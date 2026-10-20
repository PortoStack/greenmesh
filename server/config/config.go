package config

import (
	"bufio"
	"os"
	"strconv"
	"strings"
)

// Config holds all server configuration
type Config struct {
	ServerPort      string
	MqttBrokerHost  string
	MqttBrokerPort  int
	MqttClientID    string
	MqttUsername    string
	MqttPassword    string
	CorsAllowedOrigins string
	NodeTimeoutSec     int
	SimulatorEnabled   bool
	SimulatorIntervalSec int
	SimulatorIntervalMs  int
}

// Load loads configuration from environment variables with fallback defaults
func Load() *Config {
	loadDotEnv()

	port := getEnv("PORT", "8080")
	if port == "" {
		port = "8080"
	}

	mqttHost := getEnv("MQTT_BROKER_HOST", "localhost")
	mqttPortStr := getEnv("MQTT_BROKER_PORT", "1883")
	mqttPort, err := strconv.Atoi(mqttPortStr)
	if err != nil {
		mqttPort = 1883
	}

	mqttClientID := getEnv("MQTT_CLIENT_ID", "greenmesh-server")
	corsOrigins := getEnv("CORS_ORIGINS", "*")

	timeoutStr := getEnv("NODE_TIMEOUT_SEC", "15")
	timeoutSec, err := strconv.Atoi(timeoutStr)
	if err != nil {
		timeoutSec = 15
	}

	simEnabledStr := getEnv("SIMULATOR_ENABLED", "false")
	simEnabled := simEnabledStr == "true" || simEnabledStr == "1" || simEnabledStr == "yes"

	simIntervalSecStr := getEnv("SIMULATOR_INTERVAL_SEC", "2")
	simIntervalSec, err := strconv.Atoi(simIntervalSecStr)
	if err != nil || simIntervalSec <= 0 {
		simIntervalSec = 2
	}

	simIntervalMsStr := getEnv("SIMULATOR_INTERVAL_MS", "")
	simIntervalMs := 0
	if simIntervalMsStr != "" {
		simIntervalMs, _ = strconv.Atoi(simIntervalMsStr)
	}
	if simIntervalMs <= 0 {
		simIntervalMs = simIntervalSec * 1000
	} else {
		simIntervalSec = simIntervalMs / 1000
		if simIntervalSec == 0 {
			simIntervalSec = 1
		}
	}

	return &Config{
		ServerPort:           port,
		MqttBrokerHost:       mqttHost,
		MqttBrokerPort:       mqttPort,
		MqttClientID:         mqttClientID,
		MqttUsername:         getEnv("MQTT_USERNAME", ""),
		MqttPassword:         getEnv("MQTT_PASSWORD", ""),
		CorsAllowedOrigins:   corsOrigins,
		NodeTimeoutSec:       timeoutSec,
		SimulatorEnabled:     simEnabled,
		SimulatorIntervalSec: simIntervalSec,
		SimulatorIntervalMs:  simIntervalMs,
	}
}

func getEnv(key, defaultVal string) string {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		return val
	}
	return defaultVal
}

// loadDotEnv searches and parses .env file from common project locations if present
func loadDotEnv() {
	paths := []string{".env", "../.env", "../../.env"}
	for _, p := range paths {
		f, err := os.Open(p)
		if err != nil {
			continue
		}
		defer f.Close()

		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				k := strings.TrimSpace(parts[0])
				v := strings.TrimSpace(parts[1])
				v = strings.Trim(v, "\"'")
				// Only set if not already set in OS environment
				if _, exists := os.LookupEnv(k); !exists {
					_ = os.Setenv(k, v)
				}
			}
		}
		break
	}
}
