package logs

import (
	"net/http"

	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/db"
	"github.com/joakimcarlsson/juicebox/internal/response"
)

type Handler struct {
	db *db.DB
}

func NewHandler(database *db.DB) *Handler {
	return &Handler{db: database}
}

func (h *Handler) Handle(c *router.Context) {
	sessionID := c.Param("sessionId")
	if sessionID == "" {
		response.Error(c, http.StatusBadRequest, "missing sessionId")
		return
	}

	limit := c.QueryIntDefault("limit", 5000)
	offset := c.QueryIntDefault("offset", 0)

	rows, err := h.db.ListLogcatEntries(sessionID, limit, offset)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	total, err := h.db.CountLogcatEntries(sessionID)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
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
