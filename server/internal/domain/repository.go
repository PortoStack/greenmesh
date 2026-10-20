package domain

// GreenhouseRepository defines operations for maintaining greenhouse state, history, and events
type GreenhouseRepository interface {
	GetNode(id string) (*Node, error)
	GetAllNodes() map[string]*Node
	UpdateNode(node *Node) error

	GetActuator(id string) (*Actuator, error)
	GetAllActuators() map[string]*Actuator
	UpdateActuator(actuator *Actuator) error

	GetConfig() SystemConfig
	UpdateConfig(cfg SystemConfig) error

	AddTelemetryPoint(point TelemetryPoint)
	GetTelemetryHistory(nodeID string, limit int) []TelemetryPoint

	AddEvent(event SystemEvent)
	GetRecentEvents(limit int) []SystemEvent

	GetSnapshot() SystemSnapshot
}
