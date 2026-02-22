package stream

import (
	"log"
	"net/http"

	"github.com/gorilla/websocket"
	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Handler struct {
	manager *session.Manager
}

func NewHandler(manager *session.Manager) *Handler {
	return &Handler{manager: manager}
}

func (h *Handler) Handle(c *router.Context) {
	sessionId := c.Param("sessionId")
	if sessionId == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "missing sessionId"})
		return
	}

	ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[stream] WebSocket upgrade failed: %v", err)
		return
	}
	defer ws.Close()

	if err := h.manager.Subscribe(sessionId, ws); err != nil {
		log.Printf("[stream] subscribe error: %v", err)
	}
}
