package list

import (
	"encoding/json"
	"net/http"

	"github.com/joakimcarlsson/go-router/router/v2"
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
	deviceID := c.Param("deviceId")
	if deviceID == "" {
		response.Error(c, http.StatusBadRequest, "missing deviceId")
		return
	}

	limit := c.QueryIntDefault("limit", 50)
	offset := c.QueryIntDefault("offset", 0)
	bundleID := c.QueryDefault("bundleId", "")

	var sessions []db.SessionRow
	var total int
	var err error

	if bundleID != "" {
		sessions, err = h.db.ListSessionsByBundle(
			deviceID,
			bundleID,
			limit,
			offset,
		)
		if err != nil {
			response.Error(c, http.StatusInternalServerError, err.Error())
			return
		}
		total, err = h.db.CountSessionsByBundle(deviceID, bundleID)
	} else {
		sessions, err = h.db.ListSessions(deviceID, limit, offset)
		if err != nil {
			response.Error(c, http.StatusInternalServerError, err.Error())
			return
		}
		total, err = h.db.CountSessions(deviceID)
	}
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	items := make([]SessionItem, 0, len(sessions))
	for _, s := range sessions {
		httpCount, _ := h.db.CountHttpMessages(s.ID)
		logcatCount, _ := h.db.CountLogcatEntries(s.ID)

		caps := capabilitiesFor(h.manager, s)

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

func capabilitiesFor(mgr *session.Manager, row db.SessionRow) []string {
	dc := mgr.GetDeviceConnection(row.DeviceID)
	if dc != nil {
		return dc.Setup.Capabilities()
	}
	var caps []string
	if err := json.Unmarshal([]byte(row.Capabilities), &caps); err == nil &&
		len(caps) > 0 {
		return caps
	}
	return []string{}
}
