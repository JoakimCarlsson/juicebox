package stream

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/devicehub"
	"github.com/joakimcarlsson/juicebox/internal/proxy"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Handler struct {
	hubManager     *devicehub.Manager
	sessionManager *session.Manager
}

func NewHandler(hubManager *devicehub.Manager, sessionManager *session.Manager) *Handler {
	return &Handler{hubManager: hubManager, sessionManager: sessionManager}
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
		_, msg, err := ws.ReadMessage()
		if err != nil {
			break
		}
		h.handleIncoming(msg)
	}

	hub.RemoveSubscriber(ws)
}

type incomingEnvelope struct {
	Type      string          `json:"type"`
	SessionID string          `json:"sessionId"`
	Payload   json.RawMessage `json:"payload"`
}

func (h *Handler) handleIncoming(msg []byte) {
	var envelope incomingEnvelope
	if err := json.Unmarshal(msg, &envelope); err != nil {
		return
	}

	switch envelope.Type {
	case "intercept_decision":
		var decision proxy.InterceptDecision
		if err := json.Unmarshal(envelope.Payload, &decision); err != nil {
			return
		}
		sess := h.sessionManager.GetSession(envelope.SessionID)
		if sess == nil || sess.Intercept == nil {
			return
		}
		sess.Intercept.Resolve(decision)
	}
}
