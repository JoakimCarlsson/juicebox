package intercept

import (
	"encoding/json"
	"net/http"

	"github.com/joakimcarlsson/go-router/router/v2"
	"github.com/joakimcarlsson/juicebox/internal/proxy"
	"github.com/joakimcarlsson/juicebox/internal/response"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type Handler struct {
	manager *session.Manager
}

func NewHandler(manager *session.Manager) *Handler {
	return &Handler{manager: manager}
}

func (h *Handler) getIntercept(sessionID string) *proxy.InterceptEngine {
	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		return nil
	}
	dc := h.manager.GetDeviceConnection(sess.DeviceID)
	if dc == nil {
		return nil
	}
	return dc.Intercept
}

func (h *Handler) GetState(c *router.Context) {
	ie := h.getIntercept(c.Param("sessionId"))
	if ie == nil {
		response.Error(
			c,
			http.StatusNotFound,
			"session not found or not active",
		)
		return
	}

	c.JSON(http.StatusOK, stateResponse{
		Enabled:      ie.IsEnabled(),
		Rules:        ie.GetRules(),
		PendingCount: len(ie.ListPending()),
	})
}

func (h *Handler) UpdateState(c *router.Context) {
	ie := h.getIntercept(c.Param("sessionId"))
	if ie == nil {
		response.Error(
			c,
			http.StatusNotFound,
			"session not found or not active",
		)
		return
	}

	var req updateRequest
	if err := json.NewDecoder(c.Request.Body).Decode(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Enabled != nil {
		ie.SetEnabled(*req.Enabled)
	}
	if req.Rules != nil {
		ie.SetRules(*req.Rules)
	}

	c.JSON(http.StatusOK, stateResponse{
		Enabled:      ie.IsEnabled(),
		Rules:        ie.GetRules(),
		PendingCount: len(ie.ListPending()),
	})
}

func (h *Handler) ListPending(c *router.Context) {
	ie := h.getIntercept(c.Param("sessionId"))
	if ie == nil {
		response.Error(
			c,
			http.StatusNotFound,
			"session not found or not active",
		)
		return
	}

	pending := ie.ListPending()
	c.JSON(http.StatusOK, map[string]any{"pending": pending})
}

func (h *Handler) Resolve(c *router.Context) {
	ie := h.getIntercept(c.Param("sessionId"))
	if ie == nil {
		response.Error(
			c,
			http.StatusNotFound,
			"session not found or not active",
		)
		return
	}

	var decision proxy.InterceptDecision
	if err := json.NewDecoder(c.Request.Body).Decode(&decision); err != nil {
		response.Error(c, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := ie.Resolve(decision); err != nil {
		response.Error(c, http.StatusNotFound, err.Error())
		return
	}

	c.JSON(http.StatusOK, map[string]string{"status": "resolved"})
}

func (h *Handler) ResolveAll(c *router.Context) {
	ie := h.getIntercept(c.Param("sessionId"))
	if ie == nil {
		response.Error(
			c,
			http.StatusNotFound,
			"session not found or not active",
		)
		return
	}

	var req resolveAllRequest
	if err := json.NewDecoder(c.Request.Body).Decode(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Action == "" {
		req.Action = proxy.ActionForward
	}

	ie.ResolveAll(req.Action)
	c.JSON(http.StatusOK, map[string]string{"status": "resolved"})
}
