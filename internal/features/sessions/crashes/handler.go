package crashes

import (
	"encoding/json"
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

	limit := c.QueryIntDefault("limit", 500)
	offset := c.QueryIntDefault("offset", 0)

	rows, err := h.db.ListCrashes(sessionID, limit, offset)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	total, err := h.db.CountCrashes(sessionID)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	crashes := make([]CrashResponse, 0, len(rows))
	for _, r := range rows {
		cr := CrashResponse{
			ID:               r.ID,
			CrashType:        r.CrashType,
			Signal:           r.Signal,
			Address:          r.Address,
			JavaStackTrace:   r.JavaStackTrace,
			ExceptionClass:   r.ExceptionClass,
			ExceptionMessage: r.ExceptionMessage,
			Timestamp:        r.Timestamp,
		}
		if r.Registers != nil {
			var regs map[string]string
			if json.Unmarshal([]byte(*r.Registers), &regs) == nil {
				cr.Registers = regs
			}
		}
		if r.Backtrace != nil {
			var bt []string
			if json.Unmarshal([]byte(*r.Backtrace), &bt) == nil {
				cr.Backtrace = bt
			}
		}
		crashes = append(crashes, cr)
	}

	c.JSON(http.StatusOK, CrashesResponse{
		Crashes: crashes,
		Total:   total,
	})
}
