package export

import (
	"fmt"
	"net/http"
	"time"

	"github.com/joakimcarlsson/go-router/router/v2"
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

	format := c.QueryDefault("format", "har")

	rows, err := h.db.AllHttpMessages(sessionID)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	ts := time.Now().Format("20060102-150405")

	switch format {
	case "har":
		data, err := buildHAR(rows)
		if err != nil {
			response.Error(c, http.StatusInternalServerError, err.Error())
			return
		}
		c.Writer.Header().Set("Content-Type", "application/json")
		c.Writer.Header().Set("Content-Disposition",
			fmt.Sprintf(`attachment; filename="juicebox-%s-%s.har"`, sessionID[:8], ts),
		)
		c.Writer.WriteHeader(http.StatusOK)
		c.Writer.Write(data) //nolint:errcheck

	case "burp":
		data, err := buildBurpXML(rows)
		if err != nil {
			response.Error(c, http.StatusInternalServerError, err.Error())
			return
		}
		c.Writer.Header().Set("Content-Type", "application/xml")
		c.Writer.Header().Set("Content-Disposition",
			fmt.Sprintf(`attachment; filename="juicebox-%s-%s.xml"`, sessionID[:8], ts),
		)
		c.Writer.WriteHeader(http.StatusOK)
		c.Writer.Write(data) //nolint:errcheck

	default:
		response.Error(
			c,
			http.StatusBadRequest,
			"format must be 'har' or 'burp'",
		)
	}
}
