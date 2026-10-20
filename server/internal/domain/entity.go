package domain

import (
	"time"
)

// Node identifiers
const (
	NodeBedA    = "bed_a"
	NodeBedB    = "bed_b"
	NodeClimate = "climate"
	NodeUtility = "utility"
)

// Actuator types
const (
	ActuatorPump  = "pump"
	ActuatorFan   = "fan"
	ActuatorLight = "light"
)

// Event severity levels
const (
	EventLevelInfo    = "INFO"
	EventLevelWarning = "WARNING"
	EventLevelDanger  = "DANGER"
	EventLevelSuccess = "SUCCESS"
)

// Node represents an ESP32 node state according to Section 3 of proposal
type Node struct {
	ID           string    `json:"id"`            // bed_a, bed_b, climate, utility
	Name         string    `json:"name"`          // Human-readable Thai name
	Description  string    `json:"description"`   // Station purpose
	AnalogLabel  string    `json:"analog_label"`  // e.g. ความชื้นดิน, อุณหภูมิ, ความเข้มแสง
	AnalogUnit   string    `json:"analog_unit"`   // e.g. %, °C, %
	AnalogValue  float64   `json:"analog_value"`  // Potentiometer simulated value
	DigitalLabel string    `json:"digital_label"` // e.g. มีกระถาง, ขอเปิดพัดลม, น้ำต่ำ
	DigitalValue int       `json:"digital_value"` // 0 or 1
	OutputLabel  string    `json:"output_label"`  // e.g. วาล์ว A, วาล์ว B, พัดลม LED, ไฟ LED
	OutputState  int       `json:"output_state"`  // 0 or 1
	Seq          int64     `json:"seq"`           // Sequence number
	Online       bool      `json:"online"`        // Heartbeat status
	LastSeen     time.Time `json:"last_seen"`     // Timestamp of last received message
}

// Actuator represents a Modbus RTU Slave (RS485) according to Section 5 of proposal
type Actuator struct {
	ID             string    `json:"id"`              // pump, fan, light
	SlaveID        int       `json:"slave_id"`        // Modbus Slave ID (1, 2, 3)
	Type           string    `json:"type"`            // pump, fan, light
	Name           string    `json:"name"`            // Human-readable Thai name
	Coil           int       `json:"coil"`            // Coil 0: On/Off command (0 or 1)
	Mode           int       `json:"mode"`            // Holding Register 0: 0 = Manual, 1 = Auto
	Target         int       `json:"target"`          // Holding Register 1: Station target value
	Running        int       `json:"running"`         // Input Register 0: 0 or 1 simulated status
	SimulatedValue int       `json:"simulated_value"` // Input Register 1: Station simulated speed/lux/etc.
	LastUpdated    time.Time `json:"last_updated"`    // Last update timestamp
}

// Telemetry represents incoming telemetry from ESP32 via MQTT (greenhouse/<node_id>/telemetry)
type Telemetry struct {
	NodeID    string    `json:"node_id"`
	Analog    float64   `json:"analog"`
	Digital   int       `json:"digital"`
	Output    int       `json:"output"`
	Seq       int64     `json:"seq"`
	Timestamp time.Time `json:"timestamp"`
}

// Command represents a control command to send to ESP32 or Modbus Actuator
type Command struct {
	CommandID  int64  `json:"command_id,omitempty"`
	TargetType string `json:"target_type"` // "node" or "actuator"
	TargetID   string `json:"target_id"`   // node_id or actuator_type
	Output     int    `json:"output"`      // 0 or 1
	Mode       *int   `json:"mode,omitempty"`
	Source     string `json:"source,omitempty"` // "web", "auto", "rule"
}

// CommandResponse represents the execution response / ACK
type CommandResponse struct {
	Success   bool      `json:"success"`
	Message   string    `json:"message"`
	CommandID int64     `json:"command_id"`
	Timestamp time.Time `json:"timestamp"`
}

// SystemConfig represents automated rules thresholds (Section 8)
type SystemConfig struct {
	AutoMode      bool      `json:"auto_mode"`      // Global Auto/Manual mode
	MoistureAMin  float64   `json:"moisture_a_min"` // Default: 35% -> Open Valve A
	MoistureAMax  float64   `json:"moisture_a_max"` // Default: 45% -> Close Valve A
	MoistureBMin  float64   `json:"moisture_b_min"` // Default: 35% -> Open Valve B
	MoistureBMax  float64   `json:"moisture_b_max"` // Default: 45% -> Close Valve B
	TempHigh      float64   `json:"temp_high"`      // Default: 32°C -> Turn on Fan
	TempLow       float64   `json:"temp_low"`       // Default: 30°C -> Turn off Fan
	LightMin      float64   `json:"light_min"`      // Default: 30% -> Turn on Light
	LightMax      float64   `json:"light_max"`      // Default: 40% -> Turn off Light
	LastModified  time.Time `json:"last_modified"`
}

// UpdateConfigRequest represents a partial or full update to SystemConfig
type UpdateConfigRequest struct {
	AutoMode     *bool    `json:"auto_mode,omitempty"`
	MoistureAMin *float64 `json:"moisture_a_min,omitempty"`
	MoistureAMax *float64 `json:"moisture_a_max,omitempty"`
	MoistureBMin *float64 `json:"moisture_b_min,omitempty"`
	MoistureBMax *float64 `json:"moisture_b_max,omitempty"`
	TempHigh     *float64 `json:"temp_high,omitempty"`
	TempLow      *float64 `json:"temp_low,omitempty"`
	LightMin     *float64 `json:"light_min,omitempty"`
	LightMax     *float64 `json:"light_max,omitempty"`
}

// ApplyTo merges non-nil fields into target config and returns whether auto_mode or thresholds changed
func (req UpdateConfigRequest) ApplyTo(target *SystemConfig) (modeChanged bool, thresholdChanged bool) {
	if req.AutoMode != nil && *req.AutoMode != target.AutoMode {
		target.AutoMode = *req.AutoMode
		modeChanged = true
	}
	if req.MoistureAMin != nil && *req.MoistureAMin != target.MoistureAMin {
		target.MoistureAMin = *req.MoistureAMin
		thresholdChanged = true
	}
	if req.MoistureAMax != nil && *req.MoistureAMax != target.MoistureAMax {
		target.MoistureAMax = *req.MoistureAMax
		thresholdChanged = true
	}
	if req.MoistureBMin != nil && *req.MoistureBMin != target.MoistureBMin {
		target.MoistureBMin = *req.MoistureBMin
		thresholdChanged = true
	}
	if req.MoistureBMax != nil && *req.MoistureBMax != target.MoistureBMax {
		target.MoistureBMax = *req.MoistureBMax
		thresholdChanged = true
	}
	if req.TempHigh != nil && *req.TempHigh != target.TempHigh {
		target.TempHigh = *req.TempHigh
		thresholdChanged = true
	}
	if req.TempLow != nil && *req.TempLow != target.TempLow {
		target.TempLow = *req.TempLow
		thresholdChanged = true
	}
	if req.LightMin != nil && *req.LightMin != target.LightMin {
		target.LightMin = *req.LightMin
		thresholdChanged = true
	}
	if req.LightMax != nil && *req.LightMax != target.LightMax {
		target.LightMax = *req.LightMax
		thresholdChanged = true
	}
	return modeChanged, thresholdChanged
}

// SystemEvent represents an event or alert in the greenhouse
type SystemEvent struct {
	ID        string    `json:"id"`
	Timestamp time.Time `json:"timestamp"`
	Level     string    `json:"level"`   // INFO, WARNING, DANGER, SUCCESS
	Source    string    `json:"source"`  // bed_a, bed_b, climate, utility, pump, fan, light, system
	Message   string    `json:"message"`
}

// TelemetryPoint is a single point for time-series charts on Next.js
type TelemetryPoint struct {
	NodeID    string    `json:"node_id"`
	Analog    float64   `json:"analog"`
	Digital   int       `json:"digital"`
	Output    int       `json:"output"`
	Timestamp time.Time `json:"timestamp"`
}

// SystemSnapshot represents the complete real-time state for Next.js dashboard
type SystemSnapshot struct {
	Config       SystemConfig        `json:"config"`
	Nodes        map[string]*Node    `json:"nodes"`
	Actuators    map[string]*Actuator`json:"actuators"`
	RecentEvents []SystemEvent       `json:"recent_events"`
	WaterLow     bool                `json:"water_low"`
	Emergency    bool                `json:"emergency"`
	ServerTime   time.Time           `json:"server_time"`
}
