package spawn

import (
	"encoding/json"
	"net/http"

	"github.com/joakimcarlsson/go-router/router/v2"
	"github.com/joakimcarlsson/juicebox/internal/bridge"
	"github.com/joakimcarlsson/juicebox/internal/response"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type Handler struct {
	manager *session.Manager
}

func NewHandler(manager *session.Manager) *Handler {
	return &Handler{manager: manager}
}

type spawnRequest struct {
	BundleID string                `json:"bundleId"`
	Evasion  *bridge.EvasionConfig `json:"evasion,omitempty"`
}

func (h *Handler) Handle(c *router.Context) {
	deviceID := c.Param("deviceId")
	if deviceID == "" {
		response.Error(c, http.StatusBadRequest, "missing deviceId")
		return
	}

	var body spawnRequest
	if c.Request.Body != nil {
		if err := json.NewDecoder(c.Request.Body).Decode(&body); err != nil {
			response.Error(c, http.StatusBadRequest, "invalid request body")
			return
		}
	}

	if body.BundleID == "" {
		response.Error(c, http.StatusBadRequest, "missing bundleId")
		return
	}

	result, err := h.manager.SpawnApp(deviceID, body.BundleID, body.Evasion)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.JSON(http.StatusOK, result)
}
