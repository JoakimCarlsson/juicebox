package classes

import (
	"encoding/json"
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

type listResponse struct {
	Classes []string `json:"classes"`
	Total   int      `json:"total"`
}

func (h *Handler) List(c *router.Context) {
	sessionID := c.Param("sessionId")
	query := c.QueryDefault("query", "")
	limit := c.QueryIntDefault("limit", 100)
	offset := c.QueryIntDefault("offset", 0)

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		c.JSON(http.StatusNotFound, map[string]string{"error": "session not found"})
		return
	}

	raw, err := h.manager.AgentInvoke(sessionID, "classes", "list", []any{query})
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	var all []string
	if err := json.Unmarshal(raw, &all); err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to parse class list"})
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
		c.JSON(http.StatusBadRequest, map[string]string{"error": "className is required"})
		return
	}

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		c.JSON(http.StatusNotFound, map[string]string{"error": "session not found"})
		return
	}

	raw, err := h.manager.AgentInvoke(sessionID, "classes", "detail", []any{className})
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	var result json.RawMessage = raw
	c.Writer.Header().Set("Content-Type", "application/json")
	c.Writer.WriteHeader(http.StatusOK)
	c.Writer.Write(result) //nolint:errcheck
}

type invokeRequest struct {
	ClassName  string   `json:"className"`
	MethodName string   `json:"methodName"`
	Args       []string `json:"args"`
}

func (h *Handler) Invoke(c *router.Context) {
	sessionID := c.Param("sessionId")

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		c.JSON(http.StatusNotFound, map[string]string{"error": "session not found"})
		return
	}

	var req invokeRequest
	if err := json.NewDecoder(c.Request.Body).Decode(&req); err != nil {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	if req.ClassName == "" || req.MethodName == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "className and methodName are required"})
		return
	}

	args := req.Args
	if args == nil {
		args = []string{}
	}

	raw, err := h.manager.AgentInvoke(sessionID, "classes", "invokeMethod", []any{req.ClassName, req.MethodName, args})
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	c.Writer.Header().Set("Content-Type", "application/json")
	c.Writer.WriteHeader(http.StatusOK)
	c.Writer.Write(raw) //nolint:errcheck
}

type readFieldRequest struct {
	ClassName string `json:"className"`
	FieldName string `json:"fieldName"`
}

func (h *Handler) ReadField(c *router.Context) {
	sessionID := c.Param("sessionId")

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		c.JSON(http.StatusNotFound, map[string]string{"error": "session not found"})
		return
	}

	var req readFieldRequest
	if err := json.NewDecoder(c.Request.Body).Decode(&req); err != nil {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	if req.ClassName == "" || req.FieldName == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "className and fieldName are required"})
		return
	}

	raw, err := h.manager.AgentInvoke(sessionID, "classes", "readField", []any{req.ClassName, req.FieldName})
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	c.Writer.Header().Set("Content-Type", "application/json")
	c.Writer.WriteHeader(http.StatusOK)
	c.Writer.Write(raw) //nolint:errcheck
}
