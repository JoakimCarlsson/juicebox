package messages

import (
	"encoding/json"
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

	limit := c.QueryIntDefault("limit", 500)
	offset := c.QueryIntDefault("offset", 0)

	rows, err := h.db.ListHttpMessages(sessionId, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	total, err := h.db.CountHttpMessages(sessionId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	messages := make([]HttpMessageResponse, 0, len(rows))
	for _, r := range rows {
		var reqHeaders map[string]string
		json.Unmarshal([]byte(r.RequestHeaders), &reqHeaders)
		if reqHeaders == nil {
			reqHeaders = map[string]string{}
		}

		var respHeaders map[string]string
		json.Unmarshal([]byte(r.ResponseHeaders), &respHeaders)
		if respHeaders == nil {
			respHeaders = map[string]string{}
		}

		messages = append(messages, HttpMessageResponse{
			ID:                   r.ID,
			Method:               r.Method,
			URL:                  r.URL,
			RequestHeaders:       reqHeaders,
			RequestBody:          r.RequestBody,
			RequestBodyEncoding:  r.RequestBodyEncoding,
			RequestBodySize:      r.RequestBodySize,
			StatusCode:           r.StatusCode,
			ResponseHeaders:      respHeaders,
			ResponseBody:         r.ResponseBody,
			ResponseBodyEncoding: r.ResponseBodyEncoding,
			ResponseBodySize:     r.ResponseBodySize,
			Duration:             r.Duration,
			Timestamp:            r.Timestamp,
		})
	}

	c.JSON(http.StatusOK, MessagesResponse{
		Messages: messages,
		Total:    total,
	})
}
