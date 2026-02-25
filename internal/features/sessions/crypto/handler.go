package crypto

import (
	"encoding/json"
	"net/http"

	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/db"
	"github.com/joakimcarlsson/juicebox/internal/response"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type Handler struct {
	db      *db.DB
	manager *session.Manager
}

func NewHandler(database *db.DB, manager *session.Manager) *Handler {
	return &Handler{db: database, manager: manager}
}

func (h *Handler) Handle(c *router.Context) {
	sessionID := c.Param("sessionId")
	if sessionID == "" {
		response.Error(c, http.StatusBadRequest, "missing sessionId")
		return
	}

	limit := c.QueryIntDefault("limit", 500)
	offset := c.QueryIntDefault("offset", 0)

	rows, err := h.db.ListCryptoEvents(sessionID, limit, offset)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	total, err := h.db.CountCryptoEvents(sessionID)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	events := make([]CryptoEventResponse, 0, len(rows))
	for _, r := range rows {
		events = append(events, CryptoEventResponse{
			ID:        r.ID,
			Operation: r.Operation,
			Algorithm: r.Algorithm,
			Input:     r.Input,
			Output:    r.Output,
			Key:       r.Key,
			IV:        r.IV,
			Timestamp: r.Timestamp,
		})
	}

	c.JSON(http.StatusOK, CryptoEventsResponse{
		Events: events,
		Total:  total,
	})
}

func (h *Handler) Enable(c *router.Context) {
	sessionID := c.Param("sessionId")

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		response.Error(c, http.StatusNotFound, "session not found")
		return
	}

	raw, err := h.manager.AgentInvoke(sessionID, "crypto", "enable", []any{})
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.Writer.Header().Set("Content-Type", "application/json")
	c.Writer.WriteHeader(http.StatusOK)
	c.Writer.Write(raw) //nolint:errcheck
}

func (h *Handler) SharedPrefs(c *router.Context) {
	sessionID := c.Param("sessionId")

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		response.Error(c, http.StatusNotFound, "session not found")
		return
	}

	raw, err := h.manager.AgentInvoke(
		sessionID,
		"sharedprefs",
		"enumerate",
		[]any{},
	)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	var files []json.RawMessage
	if err := json.Unmarshal(raw, &files); err != nil {
		response.Error(
			c,
			http.StatusInternalServerError,
			"failed to parse shared preferences",
		)
		return
	}

	c.JSON(http.StatusOK, map[string]any{
		"files": json.RawMessage(raw),
		"total": len(files),
	})
}

func (h *Handler) Keystore(c *router.Context) {
	sessionID := c.Param("sessionId")

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		response.Error(c, http.StatusNotFound, "session not found")
		return
	}

	raw, err := h.manager.AgentInvoke(
		sessionID,
		"keystore",
		"enumerate",
		[]any{},
	)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	var entries []json.RawMessage
	if err := json.Unmarshal(raw, &entries); err != nil {
		response.Error(
			c,
			http.StatusInternalServerError,
			"failed to parse keystore entries",
		)
		return
	}

	c.JSON(http.StatusOK, map[string]any{
		"entries": json.RawMessage(raw),
		"total":   len(entries),
	})
}
