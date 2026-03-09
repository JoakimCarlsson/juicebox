package stream

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/url"

	"github.com/gorilla/websocket"
	"github.com/joakimcarlsson/go-router/router/v2"
	"github.com/joakimcarlsson/juicebox/internal/devicehub"
	"github.com/joakimcarlsson/juicebox/internal/proxy"
	"github.com/joakimcarlsson/juicebox/internal/response"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true
		}
		u, err := url.Parse(origin)
		if err != nil {
			return false
		}
		host := u.Hostname()
		return host == "localhost" || host == "127.0.0.1" || host == "::1"
	},
}

type Handler struct {
	hubManager     *devicehub.Manager
	sessionManager *session.Manager
}

func NewHandler(
	hubManager *devicehub.Manager,
	sessionManager *session.Manager,
) *Handler {
	return &Handler{hubManager: hubManager, sessionManager: sessionManager}
}

func (h *Handler) Handle(c *router.Context) {
	deviceID := c.Param("deviceId")
	if deviceID == "" {
		response.Error(c, http.StatusBadRequest, "missing deviceId")
		return
	}

	ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		slog.Warn("WebSocket upgrade failed", "error", err)
		return
	}
	defer ws.Close()

	hub := h.hubManager.GetOrCreate(deviceID)
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
		if sess == nil {
			return
		}
		dc := h.sessionManager.GetDeviceConnection(sess.DeviceID)
		if dc == nil || dc.Intercept == nil {
			return
		}
		_ = dc.Intercept.Resolve(decision)
	}
}
