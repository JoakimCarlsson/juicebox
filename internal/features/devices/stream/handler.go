package stream

import (
	"log"
	"net/http"

	"github.com/gorilla/websocket"
	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/devicehub"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Handler struct {
	hubManager *devicehub.Manager
}

func NewHandler(hubManager *devicehub.Manager) *Handler {
	return &Handler{hubManager: hubManager}
}

func (h *Handler) Handle(c *router.Context) {
	deviceId := c.Param("deviceId")
	if deviceId == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "missing deviceId"})
		return
	}

	ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[device-stream] WebSocket upgrade failed: %v", err)
		return
	}
	defer ws.Close()

	hub := h.hubManager.GetOrCreate(deviceId)
	buffered := hub.AddSubscriber(ws)

	for _, data := range buffered {
		if err := ws.WriteMessage(websocket.TextMessage, data); err != nil {
			hub.RemoveSubscriber(ws)
			return
		}
	}

	for {
		if _, _, err := ws.ReadMessage(); err != nil {
			break
		}
	}

	hub.RemoveSubscriber(ws)
}
