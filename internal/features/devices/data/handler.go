package data

import (
	"encoding/json"
	"net/http"

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

func (h *Handler) clearByDevice(c *router.Context, clearFn func(string) error) {
	deviceID := c.Param("deviceId")
	if deviceID == "" {
		response.Error(c, http.StatusBadRequest, "missing deviceId")
		return
	}
	if err := clearFn(deviceID); err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}
	c.Writer.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ClearMessages(c *router.Context) {
	h.clearByDevice(c, h.db.ClearHttpMessagesByDevice)
}

func (h *Handler) ClearLogs(
	c *router.Context,
) {
	h.clearByDevice(c, h.db.ClearLogsByDevice)
}

func (h *Handler) ClearCrashes(
	c *router.Context,
) {
	h.clearByDevice(c, h.db.ClearCrashesByDevice)
}

func (h *Handler) ClearCrypto(
	c *router.Context,
) {
	h.clearByDevice(c, h.db.ClearCryptoByDevice)
}

func (h *Handler) ClearClipboard(
	c *router.Context,
) {
	h.clearByDevice(c, h.db.ClearClipboardByDevice)
}

func (h *Handler) ClearFlutterChannels(c *router.Context) {
	h.clearByDevice(c, h.db.ClearFlutterChannelsByDevice)
}

func (h *Handler) Messages(c *router.Context) {
	deviceID := c.Param("deviceId")
	if deviceID == "" {
		response.Error(c, http.StatusBadRequest, "missing deviceId")
		return
	}

	limit := c.QueryIntDefault("limit", 500)
	offset := c.QueryIntDefault("offset", 0)

	rows, err := h.db.ListHttpMessagesByDevice(deviceID, limit, offset)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	messages := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		var reqHeaders map[string]string
		_ = json.Unmarshal([]byte(r.RequestHeaders), &reqHeaders)
		if reqHeaders == nil {
			reqHeaders = map[string]string{}
		}

		var respHeaders map[string]string
		_ = json.Unmarshal([]byte(r.ResponseHeaders), &respHeaders)
		if respHeaders == nil {
			respHeaders = map[string]string{}
		}

		m := map[string]any{
			"id":              r.ID,
			"method":          r.Method,
			"url":             r.URL,
			"requestHeaders":  reqHeaders,
			"requestBodySize": r.RequestBodySize,
			"statusCode":      r.StatusCode,
			"responseHeaders": respHeaders,
			"timestamp":       r.Timestamp,
		}
		if r.RequestBody != nil {
			m["requestBody"] = *r.RequestBody
		}
		if r.RequestBodyEncoding != "" {
			m["requestBodyEncoding"] = r.RequestBodyEncoding
		}
		if r.ResponseBody != nil {
			m["responseBody"] = *r.ResponseBody
		}
		if r.ResponseBodyEncoding != "" {
			m["responseBodyEncoding"] = r.ResponseBodyEncoding
		}
		m["responseBodySize"] = r.ResponseBodySize
		m["duration"] = r.Duration
		messages = append(messages, m)
	}

	c.JSON(http.StatusOK, map[string]any{
		"messages": messages,
		"total":    len(messages),
	})
}

func (h *Handler) Logs(c *router.Context) {
	deviceID := c.Param("deviceId")
	if deviceID == "" {
		response.Error(c, http.StatusBadRequest, "missing deviceId")
		return
	}

	limit := c.QueryIntDefault("limit", 5000)
	offset := c.QueryIntDefault("offset", 0)

	rows, err := h.db.ListLogsByDevice(deviceID, limit, offset)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	entries := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		entries = append(entries, map[string]any{
			"id":        r.ID,
			"timestamp": r.Timestamp,
			"pid":       r.PID,
			"tid":       r.TID,
			"level":     r.Level,
			"tag":       r.Tag,
			"message":   r.Message,
		})
	}

	c.JSON(http.StatusOK, map[string]any{
		"entries": entries,
		"total":   len(entries),
	})
}

func (h *Handler) Crashes(c *router.Context) {
	deviceID := c.Param("deviceId")
	if deviceID == "" {
		response.Error(c, http.StatusBadRequest, "missing deviceId")
		return
	}

	limit := c.QueryIntDefault("limit", 500)
	offset := c.QueryIntDefault("offset", 0)

	rows, err := h.db.ListCrashesByDevice(deviceID, limit, offset)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	crashes := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		crash := map[string]any{
			"id":        r.ID,
			"crashType": r.CrashType,
			"timestamp": r.Timestamp,
		}
		if r.Signal != nil {
			crash["signal"] = *r.Signal
		}
		if r.Address != nil {
			crash["address"] = *r.Address
		}
		if r.Registers != nil {
			var regs map[string]string
			_ = json.Unmarshal([]byte(*r.Registers), &regs)
			crash["registers"] = regs
		}
		if r.Backtrace != nil {
			var bt []string
			_ = json.Unmarshal([]byte(*r.Backtrace), &bt)
			crash["backtrace"] = bt
		}
		if r.JavaStackTrace != nil {
			crash["javaStackTrace"] = *r.JavaStackTrace
		}
		if r.ExceptionClass != nil {
			crash["exceptionClass"] = *r.ExceptionClass
		}
		if r.ExceptionMessage != nil {
			crash["exceptionMessage"] = *r.ExceptionMessage
		}
		crashes = append(crashes, crash)
	}

	c.JSON(http.StatusOK, map[string]any{
		"crashes": crashes,
		"total":   len(crashes),
	})
}

func (h *Handler) Crypto(c *router.Context) {
	deviceID := c.Param("deviceId")
	if deviceID == "" {
		response.Error(c, http.StatusBadRequest, "missing deviceId")
		return
	}

	limit := c.QueryIntDefault("limit", 500)
	offset := c.QueryIntDefault("offset", 0)

	rows, err := h.db.ListCryptoEventsByDevice(deviceID, limit, offset)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	events := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		evt := map[string]any{
			"id":        r.ID,
			"operation": r.Operation,
			"algorithm": r.Algorithm,
			"timestamp": r.Timestamp,
		}
		if r.Input != nil {
			evt["input"] = *r.Input
		}
		if r.Output != nil {
			evt["output"] = *r.Output
		}
		if r.Key != nil {
			evt["key"] = *r.Key
		}
		if r.IV != nil {
			evt["iv"] = *r.IV
		}
		events = append(events, evt)
	}

	c.JSON(http.StatusOK, map[string]any{
		"events": events,
		"total":  len(events),
	})
}

func (h *Handler) Clipboard(c *router.Context) {
	deviceID := c.Param("deviceId")
	if deviceID == "" {
		response.Error(c, http.StatusBadRequest, "missing deviceId")
		return
	}

	limit := c.QueryIntDefault("limit", 500)
	offset := c.QueryIntDefault("offset", 0)

	rows, err := h.db.ListClipboardEventsByDevice(deviceID, limit, offset)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	events := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		evt := map[string]any{
			"id":        r.ID,
			"direction": r.Direction,
			"timestamp": r.Timestamp,
		}
		if r.Content != nil {
			evt["content"] = *r.Content
		}
		if r.MimeType != nil {
			evt["mimeType"] = *r.MimeType
		}
		if r.CallerStack != nil {
			evt["callerStack"] = *r.CallerStack
		}
		events = append(events, evt)
	}

	c.JSON(http.StatusOK, map[string]any{
		"events": events,
		"total":  len(events),
	})
}

func (h *Handler) FlutterChannels(c *router.Context) {
	deviceID := c.Param("deviceId")
	if deviceID == "" {
		response.Error(c, http.StatusBadRequest, "missing deviceId")
		return
	}

	limit := c.QueryIntDefault("limit", 500)
	offset := c.QueryIntDefault("offset", 0)

	rows, err := h.db.ListFlutterChannelsByDevice(deviceID, limit, offset)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	events := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		evt := map[string]any{
			"id":        r.ID,
			"channel":   r.Channel,
			"direction": r.Direction,
			"timestamp": r.Timestamp,
		}
		if r.Method != nil {
			evt["method"] = *r.Method
		}
		if r.Arguments != nil {
			evt["arguments"] = *r.Arguments
		}
		if r.Result != nil {
			evt["result"] = *r.Result
		}
		events = append(events, evt)
	}

	c.JSON(http.StatusOK, map[string]any{
		"events": events,
		"total":  len(events),
	})
}

func (h *Handler) Findings(c *router.Context) {
	deviceID := c.Param("deviceId")
	if deviceID == "" {
		response.Error(c, http.StatusBadRequest, "missing deviceId")
		return
	}

	findings, err := h.db.ListFindingsByDevice(c.Request.Context(), deviceID)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.JSON(http.StatusOK, map[string]any{
		"findings": findings,
		"total":    len(findings),
	})
}

func (h *Handler) ClearFindings(c *router.Context) {
	deviceID := c.Param("deviceId")
	if deviceID == "" {
		response.Error(c, http.StatusBadRequest, "missing deviceId")
		return
	}
	if err := h.db.ClearFindingsByDevice(c.Request.Context(), deviceID); err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}
	c.Writer.WriteHeader(http.StatusNoContent)
}
