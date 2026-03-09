package classes

import (
	"encoding/json"
	"net/http"

	"github.com/joakimcarlsson/go-router/router/v2"
	"github.com/joakimcarlsson/juicebox/internal/response"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type Handler struct {
	manager *session.Manager
}

func NewHandler(manager *session.Manager) *Handler {
	return &Handler{manager: manager}
}

func (h *Handler) List(c *router.Context) {
	sessionID := c.Param("sessionId")
	query := c.QueryDefault("query", "")
	limit := c.QueryIntDefault("limit", 100)
	offset := c.QueryIntDefault("offset", 0)

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		response.Error(c, http.StatusNotFound, "session not found")
		return
	}

	raw, err := h.manager.AgentInvoke(
		sessionID,
		"classes",
		"list",
		[]any{query},
	)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	var all []string
	if err := json.Unmarshal(raw, &all); err != nil {
		response.Error(
			c,
			http.StatusInternalServerError,
			"failed to parse class list",
		)
		return
	}

	total := len(all)
	if offset > total {
		offset = total
	}
	end := offset + limit
	if end > total {
		end = total
	}

	c.JSON(http.StatusOK, listResponse{
		Classes: all[offset:end],
		Total:   total,
	})
}

func (h *Handler) Detail(c *router.Context) {
	sessionID := c.Param("sessionId")
	className := c.QueryDefault("className", "")

	if className == "" {
		response.Error(c, http.StatusBadRequest, "className is required")
		return
	}

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		response.Error(c, http.StatusNotFound, "session not found")
		return
	}

	raw, err := h.manager.AgentInvoke(
		sessionID,
		"classes",
		"detail",
		[]any{className},
	)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	var result json.RawMessage = raw
	c.Writer.Header().Set("Content-Type", "application/json")
	c.Writer.WriteHeader(http.StatusOK)
	c.Writer.Write(result) //nolint:errcheck
}

func (h *Handler) Invoke(c *router.Context) {
	sessionID := c.Param("sessionId")

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		response.Error(c, http.StatusNotFound, "session not found")
		return
	}

	var req invokeRequest
	if err := json.NewDecoder(c.Request.Body).Decode(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.ClassName == "" || req.MethodName == "" {
		response.Error(
			c,
			http.StatusBadRequest,
			"className and methodName are required",
		)
		return
	}

	args := req.Args
	if args == nil {
		args = []string{}
	}

	raw, err := h.manager.AgentInvoke(
		sessionID,
		"classes",
		"invokeMethod",
		[]any{req.ClassName, req.MethodName, args},
	)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.Writer.Header().Set("Content-Type", "application/json")
	c.Writer.WriteHeader(http.StatusOK)
	c.Writer.Write(raw) //nolint:errcheck
}

func (h *Handler) ReadField(c *router.Context) {
	sessionID := c.Param("sessionId")

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		response.Error(c, http.StatusNotFound, "session not found")
		return
	}

	var req readFieldRequest
	if err := json.NewDecoder(c.Request.Body).Decode(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.ClassName == "" || req.FieldName == "" {
		response.Error(
			c,
			http.StatusBadRequest,
			"className and fieldName are required",
		)
		return
	}

	raw, err := h.manager.AgentInvoke(
		sessionID,
		"classes",
		"readField",
		[]any{req.ClassName, req.FieldName},
	)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.Writer.Header().Set("Content-Type", "application/json")
	c.Writer.WriteHeader(http.StatusOK)
	c.Writer.Write(raw) //nolint:errcheck
}
