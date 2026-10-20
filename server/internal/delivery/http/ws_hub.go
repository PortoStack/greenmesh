package http

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/gofiber/websocket/v2"
	"greenmesh/server/internal/domain"
	"greenmesh/server/internal/usecase"
)

type wsClient struct {
	conn *websocket.Conn
	send chan []byte
}

// WSHub manages active WebSocket client connections and handles bidirectional traffic
type WSHub struct {
	mu         sync.RWMutex
	clients    map[*wsClient]bool
	useCase    usecase.GreenhouseUseCase
	register   chan *wsClient
	unregister chan *wsClient
}

// NewWSHub creates a new WSHub
func NewWSHub(useCase usecase.GreenhouseUseCase) *WSHub {
	hub := &WSHub{
		clients:    make(map[*wsClient]bool),
		useCase:    useCase,
		register:   make(chan *wsClient),
		unregister: make(chan *wsClient),
	}
	go hub.run()
	return hub
}

func (h *WSHub) run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()
		}
	}
}

// Broadcast sends a real-time event frame to all connected WebSocket clients
func (h *WSHub) Broadcast(eventType string, data interface{}) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	if len(h.clients) == 0 {
		return
	}

	payload, err := json.Marshal(map[string]interface{}{
		"event": eventType,
		"data":  data,
	})
	if err != nil {
		return
	}

	for client := range h.clients {
		select {
		case client.send <- payload:
		default:
			// Client queue full, skip to avoid blocking other clients
		}
	}
}

// HandleWS upgrades HTTP connection and manages WebSocket lifecycle
func (h *WSHub) HandleWS(c *websocket.Conn) {
	client := &wsClient{
		conn: c,
		send: make(chan []byte, 128),
	}
	h.register <- client
	defer func() {
		h.unregister <- client
		_ = c.Close()
	}()

	// 1. Immediately send full system snapshot upon connection
	snapshot := h.useCase.GetSnapshot()
	if snapBytes, err := json.Marshal(map[string]interface{}{
		"event": "init",
		"data":  snapshot,
	}); err == nil {
		_ = c.WriteMessage(websocket.TextMessage, snapBytes)
	}

	// 2. Writer pump: sends outbound messages from channel to websocket
	go func() {
		for msg := range client.send {
			_ = c.SetWriteDeadline(time.Now().Add(5 * time.Second))
			if err := c.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		}
	}()

	// 3. Reader pump: receives real-time commands from client
	for {
		_, msgBytes, err := c.ReadMessage()
		if err != nil {
			break
		}

		type InboundMsg struct {
			Type       string               `json:"type"`        // "command", "config", "ping"
			TargetType string               `json:"target_type"` // "node", "actuator"
			TargetID   string               `json:"target_id"`
			Output     *int                 `json:"output"`
			Mode       *int                 `json:"mode,omitempty"`
			Config     *domain.UpdateConfigRequest `json:"config,omitempty"`
		}

		var in InboundMsg
		if err := json.Unmarshal(msgBytes, &in); err != nil {
			continue
		}

		switch in.Type {
		case "ping":
			pong, _ := json.Marshal(map[string]interface{}{
				"type": "pong",
				"time": time.Now().UnixMilli(),
			})
			_ = c.WriteMessage(websocket.TextMessage, pong)

		case "command":
			if in.Output != nil {
				cmd := domain.Command{
					TargetType: in.TargetType,
					TargetID:   in.TargetID,
					Output:     *in.Output,
					Mode:       in.Mode,
					Source:     "websocket",
				}
				resp, err := h.useCase.SendCommand(cmd)
				errMsg := ""
				if err != nil {
					errMsg = err.Error()
				}
				ack, _ := json.Marshal(map[string]interface{}{
					"type":     "command_ack",
					"response": resp,
					"error":    errMsg,
				})
				_ = c.WriteMessage(websocket.TextMessage, ack)
			}

		case "config":
			if in.Config != nil {
				_, _ = h.useCase.UpdateConfig(*in.Config)
			}
		}
	}
}

// CompositeBroadcaster multiplexes events to multiple stream broadcasters (SSE & WebSocket)
type CompositeBroadcaster struct {
	mu           sync.RWMutex
	broadcasters []domain.StreamBroadcaster
}

// NewCompositeBroadcaster creates a new CompositeBroadcaster
func NewCompositeBroadcaster(b ...domain.StreamBroadcaster) *CompositeBroadcaster {
	return &CompositeBroadcaster{broadcasters: b}
}

// Add appends a new broadcaster to the composite
func (c *CompositeBroadcaster) Add(b domain.StreamBroadcaster) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.broadcasters = append(c.broadcasters, b)
}

// Broadcast sends the event to all registered broadcasters
func (c *CompositeBroadcaster) Broadcast(eventType string, data interface{}) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	for _, b := range c.broadcasters {
		if b != nil {
			b.Broadcast(eventType, data)
		}
	}
}
