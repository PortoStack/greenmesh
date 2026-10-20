package http

import (
	"bufio"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"greenmesh/server/internal/usecase"
)

// SSEBroadcaster implements domain.StreamBroadcaster and manages connected SSE clients
type SSEBroadcaster struct {
	mu      sync.RWMutex
	clients map[chan []byte]bool
}

// NewSSEBroadcaster creates a new SSEBroadcaster
func NewSSEBroadcaster() *SSEBroadcaster {
	return &SSEBroadcaster{
		clients: make(map[chan []byte]bool),
	}
}

// Broadcast sends an SSE event to all connected clients
func (b *SSEBroadcaster) Broadcast(eventType string, data interface{}) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if len(b.clients) == 0 {
		return
	}

	payload, err := json.Marshal(data)
	if err != nil {
		return
	}

	msg := fmt.Sprintf("event: %s\ndata: %s\n\n", eventType, string(payload))
	msgBytes := []byte(msg)

	for ch := range b.clients {
		select {
		case ch <- msgBytes:
		default:
			// Client channel full, skip to avoid blocking other clients
		}
	}
}

// HandleSSE manages the Fiber SSE stream for a connecting Next.js client
func (b *SSEBroadcaster) HandleSSE(useCase usecase.GreenhouseUseCase) fiber.Handler {
	return func(c *fiber.Ctx) error {
		c.Set("Content-Type", "text/event-stream")
		c.Set("Cache-Control", "no-cache")
		c.Set("Connection", "keep-alive")
		c.Set("Transfer-Encoding", "chunked")
		c.Set("Access-Control-Allow-Origin", "*")

		msgChan := make(chan []byte, 32)

		b.mu.Lock()
		b.clients[msgChan] = true
		b.mu.Unlock()

		c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
			defer func() {
				b.mu.Lock()
				delete(b.clients, msgChan)
				close(msgChan)
				b.mu.Unlock()
			}()

			// Send initial snapshot on connection
			snapshot := useCase.GetSnapshot()
			if snapBytes, err := json.Marshal(snapshot); err == nil {
				_, _ = fmt.Fprintf(w, "event: init\ndata: %s\n\n", string(snapBytes))
				_ = w.Flush()
			}

			// Keep-alive ticker every 15 seconds
			ticker := time.NewTicker(15 * time.Second)
			defer ticker.Stop()

			for {
				select {
				case <-ticker.C:
					_, _ = fmt.Fprintf(w, ": keepalive %d\n\n", time.Now().Unix())
					if err := w.Flush(); err != nil {
						return
					}
				case msg, ok := <-msgChan:
					if !ok {
						return
					}
					_, _ = w.Write(msg)
					if err := w.Flush(); err != nil {
						return
					}
				}
			}
		})

		return nil
	}
}
