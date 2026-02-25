package jni

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

func (h *Handler) List(c *router.Context) {
	sessionID := c.Param("sessionId")
	if sessionID == "" {
		response.Error(c, http.StatusBadRequest, "missing sessionId")
		return
	}

	limit := c.QueryIntDefault("limit", 500)
	offset := c.QueryIntDefault("offset", 0)

	rows, err := h.db.ListJNIEvents(sessionID, limit, offset)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	total, err := h.db.CountJNIEvents(sessionID)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	events := make([]JNIEventResponse, 0, len(rows))
	for _, r := range rows {
		evt := JNIEventResponse{
			ID:          r.ID,
			ClassName:   r.ClassName,
			MethodName:  r.MethodName,
			Signature:   r.Signature,
			ReturnValue: r.ReturnValue,
			Library:     r.Library,
			Timestamp:   r.Timestamp,
		}
		if r.Arguments != nil {
			var args []string
			if json.Unmarshal([]byte(*r.Arguments), &args) == nil {
				evt.Arguments = args
			}
		}
		if r.Backtrace != nil {
			var bt []string
			if json.Unmarshal([]byte(*r.Backtrace), &bt) == nil {
				evt.Backtrace = bt
			}
		}
		events = append(events, evt)
	}

	c.JSON(http.StatusOK, JNIEventsResponse{
		Events: events,
		Total:  total,
	})
}

func (h *Handler) Enable(c *router.Context) {
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

	var filter map[string]any
	if err := c.BindJSON(&filter); err != nil {
		filter = nil
	}

	args := []any{}
	if filter != nil {
		args = append(args, filter)
	}

	raw, err := h.manager.AgentInvoke(sessionID, "jni", "enable", args)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.Writer.Header().Set("Content-Type", "application/json")
	c.Writer.WriteHeader(http.StatusOK)
	c.Writer.Write(raw) //nolint:errcheck
}
