package domain

// MqttPublisher defines outbound operations for sending commands to MQTT
type MqttPublisher interface {
	PublishNodeCommand(nodeID string, output int, commandID int64) error
	PublishActuatorCommand(actuatorType string, coil int, mode *int) error
	PublishConfig(cfg SystemConfig) error
	PublishTelemetry(telemetry Telemetry) error
}

// StreamBroadcaster defines outbound operations for pushing real-time events to Next.js clients
type StreamBroadcaster interface {
	Broadcast(eventType string, data interface{})
}
