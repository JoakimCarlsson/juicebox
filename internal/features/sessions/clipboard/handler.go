package clipboard

import (
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

	rows, err := h.db.ListClipboardEvents(sessionID, limit, offset)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	total, err := h.db.CountClipboardEvents(sessionID)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	events := make([]ClipboardEventResponse, 0, len(rows))
	for _, r := range rows {
		events = append(events, ClipboardEventResponse{
			ID:          r.ID,
			Direction:   r.Direction,
			Content:     r.Content,
			MimeType:    r.MimeType,
			CallerStack: r.CallerStack,
			Timestamp:   r.Timestamp,
		})
	}

	c.JSON(http.StatusOK, ClipboardEventsResponse{
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

	raw, err := h.manager.AgentInvoke(sessionID, "clipboard", "enable", []any{})
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.Writer.Header().Set("Content-Type", "application/json")
	c.Writer.WriteHeader(http.StatusOK)
	c.Writer.Write(raw) //nolint:errcheck
}

func (h *Handler) Disable(c *router.Context) {
	sessionID := c.Param("sessionId")

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		response.Error(c, http.StatusNotFound, "session not found")
		return
	}

	raw, err := h.manager.AgentInvoke(sessionID, "clipboard", "disable", []any{})
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.Writer.Header().Set("Content-Type", "application/json")
	c.Writer.WriteHeader(http.StatusOK)
	c.Writer.Write(raw) //nolint:errcheck
}
