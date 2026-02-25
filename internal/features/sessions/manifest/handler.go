package manifest

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

func (h *Handler) Get(c *router.Context) {
	sessionID := c.Param("sessionId")
	if sessionID == "" {
		response.Error(c, http.StatusBadRequest, "missing sessionId")
		return
	}

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		response.Error(c, http.StatusNotFound, "session not found")
		return
	}

	raw, err := h.manager.AgentInvoke(sessionID, "manifest", "getManifest", []any{})
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.Writer.Header().Set("Content-Type", "application/json")
	c.Writer.WriteHeader(http.StatusOK)
	c.Writer.Write(raw) //nolint:errcheck
}

func (h *Handler) LaunchIntent(c *router.Context) {
	sessionID := c.Param("sessionId")
	if sessionID == "" {
		response.Error(c, http.StatusBadRequest, "missing sessionId")
		return
	}

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		response.Error(c, http.StatusNotFound, "session not found")
		return
	}

	var body json.RawMessage
	if err := c.BindJSON(&body); err != nil {
		response.Error(c, http.StatusBadRequest, "invalid request body")
		return
	}

	var params map[string]any
	if err := json.Unmarshal(body, &params); err != nil {
		response.Error(c, http.StatusBadRequest, "invalid JSON")
		return
	}

	raw, err := h.manager.AgentInvoke(sessionID, "manifest", "launchIntent", []any{params})
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.Writer.Header().Set("Content-Type", "application/json")
	c.Writer.WriteHeader(http.StatusOK)
	c.Writer.Write(raw) //nolint:errcheck
}
