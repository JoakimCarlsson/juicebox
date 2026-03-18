package findings

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/joakimcarlsson/go-router/router/v2"
	"github.com/joakimcarlsson/juicebox/internal/db"
	"github.com/joakimcarlsson/juicebox/internal/response"
)

var validSeverities = map[string]bool{
	"critical": true,
	"high":     true,
	"medium":   true,
	"low":      true,
	"info":     true,
}

type Handler struct {
	db *db.DB
}

func NewHandler(database *db.DB) *Handler {
	return &Handler{db: database}
}

func newID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (h *Handler) Create(c *router.Context) {
	sessionID := c.Param("sessionId")
	if sessionID == "" {
		response.Error(c, http.StatusBadRequest, "missing sessionId")
		return
	}

	var req createRequest
	if err := json.NewDecoder(c.Request.Body).Decode(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Title == "" {
		response.Error(c, http.StatusBadRequest, "title is required")
		return
	}
	if !validSeverities[req.Severity] {
		response.Error(
			c,
			http.StatusBadRequest,
			"severity must be critical, high, medium, low, or info",
		)
		return
	}

	now := time.Now().UnixMilli()
	finding := &db.FindingRow{
		ID:          newID(),
		SessionID:   sessionID,
		Title:       req.Title,
		Severity:    req.Severity,
		Description: req.Description,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	if err := h.db.CreateFinding(c.Request.Context(), finding); err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.JSON(http.StatusCreated, finding)
}

func (h *Handler) Update(c *router.Context) {
	findingID := c.Param("findingId")
	if findingID == "" {
		response.Error(c, http.StatusBadRequest, "missing findingId")
		return
	}

	var req updateRequest
	if err := json.NewDecoder(c.Request.Body).Decode(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Severity != nil && !validSeverities[*req.Severity] {
		response.Error(
			c,
			http.StatusBadRequest,
			"severity must be critical, high, medium, low, or info",
		)
		return
	}

	ctx := c.Request.Context()
	if err := h.db.UpdateFinding(ctx, findingID, req.Title, req.Severity, req.Description); err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	finding, err := h.db.GetFinding(ctx, findingID)
	if err != nil || finding == nil {
		response.Error(c, http.StatusNotFound, "finding not found")
		return
	}

	c.JSON(http.StatusOK, finding)
}

func (h *Handler) Delete(c *router.Context) {
	findingID := c.Param("findingId")
	if findingID == "" {
		response.Error(c, http.StatusBadRequest, "missing findingId")
		return
	}

	if err := h.db.DeleteFinding(c.Request.Context(), findingID); err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.JSON(http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) Export(c *router.Context) {
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

	data := buildMarkdownReport(findings)

	ts := time.Now().Format("20060102-150405")
	c.Writer.Header().Set("Content-Type", "text/markdown")
	c.Writer.Header().Set("Content-Disposition",
		fmt.Sprintf(`attachment; filename="findings-%s-%s.md"`, deviceID[:8], ts),
	)
	c.Writer.WriteHeader(http.StatusOK)
	c.Writer.Write(data) //nolint:errcheck
}
