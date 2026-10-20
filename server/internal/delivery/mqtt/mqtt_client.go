package mqtt

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	paho "github.com/eclipse/paho.mqtt.golang"
	"greenmesh/server/config"
	"greenmesh/server/internal/domain"
	"greenmesh/server/internal/usecase"
)

// Client wraps Paho MQTT client and implements domain.MqttPublisher
type Client struct {
	client  paho.Client
	useCase usecase.GreenhouseUseCase
	cfg     *config.Config
}

// NewClient initializes and connects the MQTT client
func NewClient(cfg *config.Config) *Client {
	return &Client{
		cfg: cfg,
	}
}

// SetUseCase links the usecase after initialization
func (c *Client) SetUseCase(u usecase.GreenhouseUseCase) {
	c.useCase = u
}

// Connect establishes the MQTT connection to Mosquitto
func (c *Client) Connect() error {
	brokerURI := fmt.Sprintf("tcp://%s:%d", c.cfg.MqttBrokerHost, c.cfg.MqttBrokerPort)
	log.Printf("[MQTT] Connecting to broker at %s with client ID '%s'...", brokerURI, c.cfg.MqttClientID)

	opts := paho.NewClientOptions().
		AddBroker(brokerURI).
		SetClientID(fmt.Sprintf("%s-%d", c.cfg.MqttClientID, time.Now().UnixNano()%10000)).
		SetAutoReconnect(true).
		SetCleanSession(true).
		SetKeepAlive(30 * time.Second).
		SetPingTimeout(10 * time.Second).
		SetConnectionLostHandler(func(_ paho.Client, err error) {
			log.Printf("[MQTT] Connection lost: %v. Reconnecting automatically...", err)
		}).
		SetOnConnectHandler(func(client paho.Client) {
			log.Printf("[MQTT] Successfully connected to %s", brokerURI)
			c.subscribeTopics(client)
		})

	if c.cfg.MqttUsername != "" {
		opts.SetUsername(c.cfg.MqttUsername)
		opts.SetPassword(c.cfg.MqttPassword)
	}

	client := paho.NewClient(opts)
	token := client.Connect()
	if token.Wait() && token.Error() != nil {
		log.Printf("[MQTT] Initial connection failed: %v (will retry in background)", token.Error())
		// Still assign client so auto-reconnect can work
		c.client = client
		return token.Error()
	}

	c.client = client
	return nil
}

// Disconnect gracefully disconnects from the MQTT broker
func (c *Client) Disconnect() {
	if c.client != nil && c.client.IsConnected() {
		log.Printf("[MQTT] Disconnecting...")
		c.client.Disconnect(250)
	}
}

func (c *Client) subscribeTopics(client paho.Client) {
	topics := map[string]paho.MessageHandler{
		// ESP32 Telemetry: greenhouse/<node_id>/telemetry
		"greenhouse/+/telemetry": c.handleTelemetry,
		// ESP32 State feedback: greenhouse/<node_id>/state
		"greenhouse/+/state": c.handleNodeState,
		// Modbus Actuator State: greenhouse/actuator/+/state
		"greenhouse/actuator/+/state": c.handleActuatorState,
		// Alternative Modbus State: greenhouse/modbus/+/state
		"greenhouse/modbus/+/state": c.handleModbusState,
		// System Alerts: greenhouse/alerts
		"greenhouse/alerts": c.handleAlert,
	}

	for topic, handler := range topics {
		t := client.Subscribe(topic, 1, handler)
		if t.Wait() && t.Error() != nil {
			log.Printf("[MQTT] Failed to subscribe to topic '%s': %v", topic, t.Error())
		} else {
			log.Printf("[MQTT] Subscribed to topic: %s", topic)
		}
	}
}

func (c *Client) handleTelemetry(_ paho.Client, msg paho.Message) {
	if c.useCase == nil {
		return
	}

	topicParts := strings.Split(msg.Topic(), "/")
	nodeID := ""
	if len(topicParts) >= 2 {
		nodeID = topicParts[1]
	}

	type RawTelemetry struct {
		NodeID    string  `json:"node_id"`
		Analog    float64 `json:"analog"`
		Digital   int     `json:"digital"`
		Output    int     `json:"output"`
		Seq       int64   `json:"seq"`
		Source    string  `json:"source,omitempty"`
		Timestamp int64   `json:"timestamp,omitempty"`
	}

	var raw RawTelemetry
	if err := json.Unmarshal(msg.Payload(), &raw); err != nil {
		log.Printf("[MQTT] Failed to parse telemetry JSON from topic '%s': %v", msg.Topic(), err)
		return
	}

	// Skip telemetry published by our own simulator to prevent echo loop / duplicate history
	if raw.Source == "server_sim" {
		return
	}

	if raw.NodeID == "" {
		raw.NodeID = nodeID
	}

	t := domain.Telemetry{
		NodeID:    raw.NodeID,
		Analog:    raw.Analog,
		Digital:   raw.Digital,
		Output:    raw.Output,
		Seq:       raw.Seq,
		Timestamp: time.Now(),
	}

	log.Printf("[MQTT] 📥 Telemetry received from '%s': Analog=%.1f, Digital=%d, Output=%d, Seq=%d", raw.NodeID, raw.Analog, raw.Digital, raw.Output, raw.Seq)
	if err := c.useCase.ProcessTelemetry(t); err != nil {
		log.Printf("[MQTT] Error processing telemetry for node '%s': %v", raw.NodeID, err)
	}
}

func (c *Client) handleNodeState(_ paho.Client, msg paho.Message) {
	if c.useCase == nil {
		return
	}

	topicParts := strings.Split(msg.Topic(), "/")
	nodeID := ""
	if len(topicParts) >= 2 {
		nodeID = topicParts[1]
	}

	type NodeStateMsg struct {
		NodeID string `json:"node_id"`
		Output int    `json:"output"`
		Online *bool  `json:"online,omitempty"`
	}

	var raw NodeStateMsg
	if err := json.Unmarshal(msg.Payload(), &raw); err != nil {
		log.Printf("[MQTT] Failed to parse node state JSON: %v", err)
		return
	}

	if raw.NodeID == "" {
		raw.NodeID = nodeID
	}

	online := true
	if raw.Online != nil {
		online = *raw.Online
	}

	log.Printf("[MQTT] 📥 Node State received from '%s': Output=%d, Online=%v", raw.NodeID, raw.Output, online)
	_ = c.useCase.UpdateNodeState(raw.NodeID, raw.Output, online)
}

func (c *Client) handleActuatorState(_ paho.Client, msg paho.Message) {
	if c.useCase == nil {
		return
	}

	topicParts := strings.Split(msg.Topic(), "/")
	actType := ""
	if len(topicParts) >= 3 {
		actType = topicParts[2]
	}

	type ActuatorMsg struct {
		SlaveID        int    `json:"slave_id"`
		Type           string `json:"type"`
		Coil           int    `json:"coil"`
		Mode           int    `json:"mode"`
		Target         int    `json:"target"`
		Running        int    `json:"running"`
		SimulatedValue int    `json:"value"`
	}

	var raw ActuatorMsg
	if err := json.Unmarshal(msg.Payload(), &raw); err != nil {
		log.Printf("[MQTT] Failed to parse actuator state JSON: %v", err)
		return
	}

	if raw.Type == "" {
		raw.Type = actType
	}

	act := domain.Actuator{
		ID:             raw.Type,
		SlaveID:        raw.SlaveID,
		Type:           raw.Type,
		Coil:           raw.Coil,
		Mode:           raw.Mode,
		Target:         raw.Target,
		Running:        raw.Running,
		SimulatedValue: raw.SimulatedValue,
		LastUpdated:    time.Now(),
	}

	log.Printf("[MQTT] 📥 Actuator State received: type=%s (Slave %d), coil=%d, running=%d", raw.Type, raw.SlaveID, raw.Coil, raw.Running)
	_ = c.useCase.UpdateActuatorState(act)
}

func (c *Client) handleModbusState(_ paho.Client, msg paho.Message) {
	// Re-route modbus topic to actuator handler
	c.handleActuatorState(nil, msg)
}

func (c *Client) handleAlert(_ paho.Client, msg paho.Message) {
	if c.useCase == nil {
		return
	}

	type AlertMsg struct {
		Level   string `json:"level"`
		Source  string `json:"source"`
		Message string `json:"message"`
	}

	var raw AlertMsg
	if err := json.Unmarshal(msg.Payload(), &raw); err != nil {
		log.Printf("[MQTT] Failed to parse alert JSON: %v", err)
		return
	}

	_ = c.useCase.RecordAlert(raw.Level, raw.Source, raw.Message)
}

// PublishNodeCommand publishes an output control command to greenhouse/<node_id>/command
func (c *Client) PublishNodeCommand(nodeID string, output int, commandID int64) error {
	if c.client == nil || !c.client.IsConnected() {
		log.Printf("[MQTT] Broker not connected, cannot publish node command to %s", nodeID)
		return nil
	}

	topic := fmt.Sprintf("greenhouse/%s/command", nodeID)
	payload := map[string]interface{}{
		"command_id": commandID,
		"output":     output,
		"timestamp":  time.Now().UnixMilli(),
	}

	bytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	token := c.client.Publish(topic, 1, false, bytes)
	token.Wait()
	return token.Error()
}

// PublishActuatorCommand publishes command to greenhouse/actuator/<type>/command
func (c *Client) PublishActuatorCommand(actuatorType string, coil int, mode *int) error {
	if c.client == nil || !c.client.IsConnected() {
		log.Printf("[MQTT] Broker not connected, cannot publish actuator command to %s", actuatorType)
		return nil
	}

	topic := fmt.Sprintf("greenhouse/actuator/%s/command", actuatorType)
	payload := map[string]interface{}{
		"command":   "SET_COIL",
		"coil":      coil,
		"timestamp": time.Now().UnixMilli(),
	}
	if mode != nil {
		payload["mode"] = *mode
	}

	bytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	token := c.client.Publish(topic, 1, false, bytes)
	token.Wait()
	return token.Error()
}

// PublishConfig publishes system configuration to greenhouse/system/config
func (c *Client) PublishConfig(cfg domain.SystemConfig) error {
	if c.client == nil || !c.client.IsConnected() {
		log.Printf("[MQTT] Broker not connected, cannot publish config")
		return nil
	}

	topic := "greenhouse/system/config"
	bytes, err := json.Marshal(cfg)
	if err != nil {
		return err
	}

	token := c.client.Publish(topic, 1, true, bytes)
	token.Wait()
	return token.Error()
}

// PublishTelemetry publishes node telemetry to greenhouse/<node_id>/telemetry
func (c *Client) PublishTelemetry(t domain.Telemetry) error {
	if c.client == nil || !c.client.IsConnected() {
		return nil
	}

	topic := fmt.Sprintf("greenhouse/%s/telemetry", t.NodeID)
	payload := map[string]interface{}{
		"node_id":   t.NodeID,
		"analog":    t.Analog,
		"digital":   t.Digital,
		"output":    t.Output,
		"seq":       t.Seq,
		"source":    "server_sim",
		"timestamp": t.Timestamp.UnixMilli(),
	}

	bytes, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	token := c.client.Publish(topic, 1, false, bytes)
	token.Wait()
	return token.Error()
}
