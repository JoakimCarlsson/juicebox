package list

import (
	"net/http"

	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/db"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

var platformCapabilities = map[string][]string{
	"android": {"filesystem", "database", "logstream", "frida"},
	"ios":     {},
}

type Handler struct {
	db      *db.DB
	manager *session.Manager
}

func NewHandler(database *db.DB, manager *session.Manager) *Handler {
	return &Handler{db: database, manager: manager}
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

		caps := capabilitiesFor(h.manager, s.ID, s.Platform)

		items = append(items, SessionItem{
			ID:           s.ID,
			DeviceID:     s.DeviceID,
			BundleID:     s.BundleID,
			PID:          s.PID,
			Name:         s.Name,
			Platform:     s.Platform,
			StartedAt:    s.StartedAt,
			EndedAt:      s.EndedAt,
			HttpCount:    httpCount,
			LogcatCount:  logcatCount,
			Capabilities: caps,
		})
	}

	c.JSON(http.StatusOK, ListResponse{
		Sessions: items,
		Total:    total,
	})
}

func capabilitiesFor(mgr *session.Manager, sessionID, platform string) []string {
	if sess := mgr.GetSession(sessionID); sess != nil && sess.Setup != nil {
		return sess.Setup.Capabilities()
	}
	if caps, ok := platformCapabilities[platform]; ok {
		return caps
	}
	return []string{}
}
