package memory

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

type scanRequest struct {
	Pattern string `json:"pattern"`
}

type dumpRequest struct {
	Address string `json:"address"`
	Size    int    `json:"size"`
}

func (h *Handler) Scan(c *router.Context) {
	sessionID := c.Param("sessionId")

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		response.Error(c, http.StatusNotFound, "session not found")
		return
	}

	var req scanRequest
	if err := json.NewDecoder(c.Request.Body).Decode(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Pattern == "" {
		response.Error(c, http.StatusBadRequest, "pattern is required")
		return
	}

	raw, err := h.manager.AgentInvoke(
		sessionID,
		"memory",
		"scan",
		[]any{req.Pattern},
	)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.Writer.Header().Set("Content-Type", "application/json")
	c.Writer.WriteHeader(http.StatusOK)
	c.Writer.Write(raw) //nolint:errcheck
}

func (h *Handler) StopScan(c *router.Context) {
	sessionID := c.Param("sessionId")

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		response.Error(c, http.StatusNotFound, "session not found")
		return
	}

	raw, err := h.manager.AgentInvoke(
		sessionID,
		"memory",
		"stopScan",
		[]any{},
	)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.Writer.Header().Set("Content-Type", "application/json")
	c.Writer.WriteHeader(http.StatusOK)
	c.Writer.Write(raw) //nolint:errcheck
}

func (h *Handler) Dump(c *router.Context) {
	sessionID := c.Param("sessionId")

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		response.Error(c, http.StatusNotFound, "session not found")
		return
	}

	var req dumpRequest
	if err := json.NewDecoder(c.Request.Body).Decode(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Address == "" || req.Size <= 0 {
		response.Error(
			c,
			http.StatusBadRequest,
			"address and positive size are required",
		)
		return
	}

	raw, err := h.manager.AgentInvoke(
		sessionID,
		"memory",
		"dump",
		[]any{req.Address, req.Size},
	)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.Writer.Header().Set("Content-Type", "application/json")
	c.Writer.WriteHeader(http.StatusOK)
	c.Writer.Write(raw) //nolint:errcheck
}
