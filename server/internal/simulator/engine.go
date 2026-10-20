package simulator

import (
	"fmt"
	"log"
	"math"
	"math/rand"
	"sync"
	"time"

	"greenmesh/server/internal/domain"
	"greenmesh/server/internal/usecase"
)

// Status represents the current state of the simulator engine
type Status struct {
	Running     bool      `json:"running"`
	IntervalSec int       `json:"interval_sec"`
	IntervalMs  int       `json:"interval_ms"`
	Scenario    string    `json:"scenario"`
	LastTick    time.Time `json:"last_tick"`
	MoistureA   float64   `json:"moisture_a"`
	MoistureB   float64   `json:"moisture_b"`
	Temperature float64   `json:"temperature"`
	Light       float64   `json:"light"`
	WaterLow    bool      `json:"water_low"`
	PotPresentA bool      `json:"pot_present_a"`
	PotPresentB bool      `json:"pot_present_b"`
}

// Engine defines operations to control the sensor simulator
type Engine interface {
	Start()
	Stop()
	IsRunning() bool
	GetStatus() Status
	SetScenario(name string) error
	Reset()
}

type engine struct {
	useCase usecase.GreenhouseUseCase
	mqttPub domain.MqttPublisher

	mu          sync.RWMutex
	running     bool
	interval    time.Duration
	stopChan    chan struct{}
	lastTick    time.Time
	scenario    string

	// Physical simulation state
	moistureA   float64
	moistureB   float64
	temp        float64
	light       float64
	lightAngle  float64
	waterLow    bool
	potPresentA bool
	potPresentB bool
}

// NewEngine creates a new Simulator Engine instance
func NewEngine(
	useCase usecase.GreenhouseUseCase,
	mqttPub domain.MqttPublisher,
	intervalMs int,
) Engine {
	// If passed small numbers like 1 or 2, treat as seconds for compatibility
	if intervalMs > 0 && intervalMs <= 10 {
		intervalMs = intervalMs * 1000
	}
	if intervalMs < 100 {
		intervalMs = 2000
	}

	e := &engine{
		useCase:     useCase,
		mqttPub:     mqttPub,
		interval:    time.Duration(intervalMs) * time.Millisecond,
		scenario:    "normal",
		moistureA:   38.0,
		moistureB:   41.0,
		temp:        29.5,
		light:       55.0,
		potPresentA: true,
		potPresentB: true,
		waterLow:    false,
	}

	return e
}

func (e *engine) Start() {
	e.mu.Lock()
	if e.running {
		e.mu.Unlock()
		return
	}
	e.running = true
	e.stopChan = make(chan struct{})
	e.mu.Unlock()

	log.Printf("[Simulator] 🚀 Started automated greenhouse sensor simulator (interval: %v)", e.interval)

	// Execute initial tick immediately
	go e.runLoop()
}

func (e *engine) Stop() {
	e.mu.Lock()
	defer e.mu.Unlock()

	if !e.running {
		return
	}
	e.running = false
	if e.stopChan != nil {
		close(e.stopChan)
	}
	log.Println("[Simulator] ⏸️ Stopped automated greenhouse sensor simulator")
}

func (e *engine) IsRunning() bool {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.running
}

func (e *engine) GetStatus() Status {
	e.mu.RLock()
	defer e.mu.RUnlock()

	return Status{
		Running:     e.running,
		IntervalSec: int(e.interval.Seconds()),
		IntervalMs:  int(e.interval.Milliseconds()),
		Scenario:    e.scenario,
		LastTick:    e.lastTick,
		MoistureA:   math.Round(e.moistureA*10) / 10,
		MoistureB:   math.Round(e.moistureB*10) / 10,
		Temperature: math.Round(e.temp*10) / 10,
		Light:       math.Round(e.light*10) / 10,
		WaterLow:    e.waterLow,
		PotPresentA: e.potPresentA,
		PotPresentB: e.potPresentB,
	}
}

func (e *engine) SetScenario(name string) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	switch name {
	case "water_low":
		e.waterLow = true
		e.scenario = "water_low"
		log.Println("[Simulator] ⚠️ Scenario activated: LOW WATER ALARM")
	case "pot_removed":
		e.potPresentA = false
		e.scenario = "pot_removed"
		log.Println("[Simulator] ⚠️ Scenario activated: POT REMOVED (BED A)")
	case "heatwave":
		e.temp = 36.5
		e.scenario = "heatwave"
		log.Println("[Simulator] ⚠️ Scenario activated: HEATWAVE (> 36°C)")
	case "normal":
		e.waterLow = false
		e.potPresentA = true
		e.potPresentB = true
		e.scenario = "normal"
		log.Println("[Simulator] ℹ️ Scenario reset to NORMAL")
	default:
		return fmt.Errorf("unknown scenario '%s' (available: normal, water_low, pot_removed, heatwave)", name)
	}

	return nil
}

func (e *engine) Reset() {
	e.mu.Lock()
	defer e.mu.Unlock()

	e.scenario = "normal"
	e.moistureA = 38.0
	e.moistureB = 41.0
	e.temp = 29.5
	e.light = 55.0
	e.lightAngle = 0
	e.potPresentA = true
	e.potPresentB = true
	e.waterLow = false
}

func (e *engine) runLoop() {
	ticker := time.NewTicker(e.interval)
	defer ticker.Stop()

	// Initial immediate tick
	e.stepPhysicsAndPublish()

	for {
		select {
		case <-ticker.C:
			e.stepPhysicsAndPublish()
		case <-e.stopChan:
			return
		}
	}
}

func (e *engine) stepPhysicsAndPublish() {
	e.mu.Lock()
	defer e.mu.Unlock()

	now := time.Now()
	e.lastTick = now

	// 1. Fetch current node and actuator states to calculate feedback loop
	nodes := e.useCase.GetNodes()
	actuators := e.useCase.GetActuators()

	valveAState := 0
	if node, exists := nodes[domain.NodeBedA]; exists {
		valveAState = node.OutputState
	}

	valveBState := 0
	if node, exists := nodes[domain.NodeBedB]; exists {
		valveBState = node.OutputState
	}

	fanState := 0
	if act, exists := actuators[domain.ActuatorFan]; exists {
		fanState = act.Running
	}
	if node, exists := nodes[domain.NodeClimate]; exists && node.OutputState == 1 {
		fanState = 1
	}

	lightState := 0
	if act, exists := actuators[domain.ActuatorLight]; exists {
		lightState = act.Running
	}
	if node, exists := nodes[domain.NodeUtility]; exists && node.OutputState == 1 {
		lightState = 1
	}

	// 2. Closed-Loop Physics: Soil Moisture Bed A
	if valveAState == 1 && !e.waterLow {
		// Valve is watering -> soil moisture rises
		e.moistureA += 1.2 + rand.Float64()*0.4
		if e.moistureA > 52.0 {
			e.moistureA = 52.0
		}
	} else {
		// Soil dries out gradually
		e.moistureA -= 0.35 + rand.Float64()*0.2
		if e.moistureA < 22.0 {
			e.moistureA = 22.0
		}
	}

	// 3. Closed-Loop Physics: Soil Moisture Bed B
	if valveBState == 1 && !e.waterLow {
		e.moistureB += 1.0 + rand.Float64()*0.4
		if e.moistureB > 50.0 {
			e.moistureB = 50.0
		}
	} else {
		e.moistureB -= 0.3 + rand.Float64()*0.2
		if e.moistureB < 24.0 {
			e.moistureB = 24.0
		}
	}

	// 4. Closed-Loop Physics: Temperature & Fan
	if fanState == 1 {
		// Fan cooling active -> temperature decreases
		e.temp -= 0.6 + rand.Float64()*0.2
		if e.temp < 27.5 {
			e.temp = 27.5
		}
	} else {
		// Sun heating up greenhouse gradually
		step := 0.25 + rand.Float64()*0.2
		if e.scenario == "heatwave" {
			step = 0.5 + rand.Float64()*0.3
		}
		e.temp += step
		if e.temp > 37.0 {
			e.temp = 37.0
		}
	}

	// 5. Environmental Physics: Light Intensity
	e.lightAngle += 0.08
	ambientLight := 45.0 + 25.0*math.Sin(e.lightAngle) + (rand.Float64()*4.0 - 2.0)
	if lightState == 1 {
		ambientLight += 18.0
	}
	if ambientLight < 12.0 {
		ambientLight = 12.0
	} else if ambientLight > 95.0 {
		ambientLight = 95.0
	}
	e.light = ambientLight

	// 6. Build Telemetry packets for each node
	digitalA := 1
	if !e.potPresentA {
		digitalA = 0
	}

	digitalB := 1
	if !e.potPresentB {
		digitalB = 0
	}

	digitalUtil := 0
	if e.waterLow {
		digitalUtil = 1
	}

	telemetries := []domain.Telemetry{
		{
			NodeID:    domain.NodeBedA,
			Analog:    math.Round(e.moistureA*10) / 10,
			Digital:   digitalA,
			Output:    valveAState,
			Seq:       now.UnixMilli(),
			Timestamp: now,
		},
		{
			NodeID:    domain.NodeBedB,
			Analog:    math.Round(e.moistureB*10) / 10,
			Digital:   digitalB,
			Output:    valveBState,
			Seq:       now.UnixMilli() + 1,
			Timestamp: now,
		},
		{
			NodeID:    domain.NodeClimate,
			Analog:    math.Round(e.temp*10) / 10,
			Digital:   0,
			Output:    fanState,
			Seq:       now.UnixMilli() + 2,
			Timestamp: now,
		},
		{
			NodeID:    domain.NodeUtility,
			Analog:    math.Round(e.light*10) / 10,
			Digital:   digitalUtil,
			Output:    lightState,
			Seq:       now.UnixMilli() + 3,
			Timestamp: now,
		},
	}

	// 7. Process through UseCase (updates in-memory state, history, rules, SSE)
	// and publish to MQTT if connected
	for _, t := range telemetries {
		if err := e.useCase.ProcessTelemetry(t); err != nil {
			log.Printf("[Simulator] Error processing telemetry for %s: %v", t.NodeID, err)
		}
		if e.mqttPub != nil {
			_ = e.mqttPub.PublishTelemetry(t)
		}
	}
}
