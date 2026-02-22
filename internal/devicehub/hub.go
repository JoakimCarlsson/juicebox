package devicehub

import (
	"sync"

	"github.com/gorilla/websocket"
)

type Hub struct {
	DeviceID      string
	mu            sync.Mutex
	subscribers   map[*websocket.Conn]struct{}
	messageBuffer [][]byte
}

func newHub(deviceID string) *Hub {
	return &Hub{
		DeviceID:    deviceID,
		subscribers: make(map[*websocket.Conn]struct{}),
	}
}

func (h *Hub) Broadcast(data []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if len(h.subscribers) == 0 {
		if len(h.messageBuffer) < 1000 {
			h.messageBuffer = append(h.messageBuffer, data)
		}
		return
	}

	for ws := range h.subscribers {
		if err := ws.WriteMessage(websocket.TextMessage, data); err != nil {
			delete(h.subscribers, ws)
			ws.Close()
		}
	}
}

func (h *Hub) AddSubscriber(ws *websocket.Conn) [][]byte {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.subscribers[ws] = struct{}{}
	buffered := h.messageBuffer
	h.messageBuffer = nil
	return buffered
}

func (h *Hub) RemoveSubscriber(ws *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.subscribers, ws)
}
