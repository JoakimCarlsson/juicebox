package attach

import (
	"net/http"

	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type Handler struct {
	manager *session.Manager
}

func NewHandler(manager *session.Manager) *Handler {
	return &Handler{manager: manager}
}

func (h *Handler) Handle(c *router.Context) {
	deviceId := c.Param("deviceId")
	bundleId := c.Param("bundleId")
	sessionId := c.QueryDefault("sessionId", "")

	if deviceId == "" || bundleId == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "missing deviceId or bundleId"})
		return
	}

	resp, err := h.manager.Attach(deviceId, bundleId, sessionId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, AttachResponseBody{
		SessionID: resp.SessionID,
		PID:       resp.PID,
	})
}
