package list

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
	deviceId := c.Param("deviceId")
	if deviceId == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "missing deviceId"})
		return
	}

	limit := c.QueryIntDefault("limit", 50)
	offset := c.QueryIntDefault("offset", 0)
	bundleId := c.QueryDefault("bundleId", "")

	var sessions []db.SessionRow
	var total int
	var err error

	if bundleId != "" {
		sessions, err = h.db.ListSessionsByBundle(deviceId, bundleId, limit, offset)
		if err != nil {
			c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		total, err = h.db.CountSessionsByBundle(deviceId, bundleId)
	} else {
		sessions, err = h.db.ListSessions(deviceId, limit, offset)
		if err != nil {
			c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		total, err = h.db.CountSessions(deviceId)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	items := make([]SessionItem, 0, len(sessions))
	for _, s := range sessions {
		httpCount, _ := h.db.CountHttpMessages(s.ID)
		logcatCount, _ := h.db.CountLogcatEntries(s.ID)

		items = append(items, SessionItem{
			ID:          s.ID,
			DeviceID:    s.DeviceID,
			BundleID:    s.BundleID,
			PID:         s.PID,
			StartedAt:   s.StartedAt,
			EndedAt:     s.EndedAt,
			HttpCount:   httpCount,
			LogcatCount: logcatCount,
		})
	}

	c.JSON(http.StatusOK, ListResponse{
		Sessions: items,
		Total:    total,
	})
}
