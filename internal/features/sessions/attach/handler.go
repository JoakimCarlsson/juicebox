package attach

import (
	"encoding/json"
	"net/http"

	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/response"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type Handler struct {
	manager *session.Manager
}

func NewHandler(manager *session.Manager) *Handler {
	return &Handler{manager: manager}
}

func (h *Handler) Handle(c *router.Context) {
	deviceID := c.Param("deviceId")
	bundleID := c.Param("bundleId")
	sessionID := c.QueryDefault("sessionId", "")

	if deviceID == "" || bundleID == "" {
		response.Error(c, http.StatusBadRequest, "missing deviceId or bundleId")
		return
	}

	var body AttachRequestBody
	if c.Request.Body != nil {
		_ = json.NewDecoder(c.Request.Body).Decode(&body)
	}

	resp, err := h.manager.Attach(deviceID, bundleID, sessionID, body.Evasion)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.JSON(http.StatusOK, AttachResponseBody{
		SessionID:    resp.SessionID,
		PID:          resp.PID,
		Capabilities: resp.Capabilities,
	})
}
