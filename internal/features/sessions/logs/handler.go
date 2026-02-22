package logs

import (
	"net/http"

	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/db"
)

type Handler struct {
	db *db.DB
}

func NewHandler(database *db.DB) *Handler {
	return &Handler{db: database}
}

func (h *Handler) Handle(c *router.Context) {
	sessionId := c.Param("sessionId")
	if sessionId == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "missing sessionId"})
		return
	}

	limit := c.QueryIntDefault("limit", 5000)
	offset := c.QueryIntDefault("offset", 0)

	rows, err := h.db.ListLogcatEntries(sessionId, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	total, err := h.db.CountLogcatEntries(sessionId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	entries := make([]LogcatEntryResponse, 0, len(rows))
	for _, r := range rows {
		entries = append(entries, LogcatEntryResponse{
			ID:        r.ID,
			Timestamp: r.Timestamp,
			PID:       r.PID,
			TID:       r.TID,
			Level:     r.Level,
			Tag:       r.Tag,
			Message:   r.Message,
		})
	}

	c.JSON(http.StatusOK, LogsResponse{
		Entries: entries,
		Total:   total,
	})
}
