package scripts

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/db"
	"github.com/joakimcarlsson/juicebox/internal/devicehub"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type Handler struct {
	db         *db.DB
	manager    *session.Manager
	hubManager *devicehub.Manager
}

func NewHandler(database *db.DB, manager *session.Manager, hubManager *devicehub.Manager) *Handler {
	return &Handler{db: database, manager: manager, hubManager: hubManager}
}

type runRequest struct {
	Code string `json:"code"`
}

type scriptResponse struct {
	ID        string            `json:"id"`
	SessionID string            `json:"sessionId"`
	Code      string            `json:"code"`
	Output    []json.RawMessage `json:"output"`
	Status    string            `json:"status"`
	Timestamp int64             `json:"timestamp"`
	Error     string            `json:"error,omitempty"`
}

func (h *Handler) Run(c *router.Context) {
	sessionID := c.Param("sessionId")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "missing sessionId"})
		return
	}

	var req runRequest
	if err := json.NewDecoder(c.Request.Body).Decode(&req); err != nil {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if req.Code == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "code is required"})
		return
	}

	liveSess := h.manager.GetSession(sessionID)
	if liveSess == nil {
		c.JSON(http.StatusNotFound, map[string]string{"error": "active session not found"})
		return
	}

	scriptID := fmt.Sprintf("scr_%d", time.Now().UnixNano())
	now := time.Now().UnixMilli()

	_ = h.db.InsertScript(db.ScriptRow{
		ID:        scriptID,
		SessionID: sessionID,
		Code:      req.Code,
		Status:    "running",
		Timestamp: now,
	})

	hub := h.hubManager.GetOrCreate(liveSess.DeviceID)
	scriptRunPayload, _ := json.Marshal(map[string]any{
		"scriptId": scriptID,
		"code":     req.Code,
	})
	if data, err := devicehub.Marshal("script_run", sessionID, json.RawMessage(scriptRunPayload)); err == nil {
		hub.Broadcast(data)
	}

	resp, err := h.manager.RunScript(sessionID, req.Code, 30)

	if err != nil {
		_ = h.db.UpdateScriptOutput(scriptID, "", "error")
		c.JSON(http.StatusInternalServerError, scriptResponse{
			ID:        scriptID,
			SessionID: sessionID,
			Code:      req.Code,
			Status:    "error",
			Timestamp: now,
			Error:     err.Error(),
		})
		return
	}

	outputJSON, _ := json.Marshal(resp.Messages)
	_ = h.db.UpdateScriptOutput(scriptID, string(outputJSON), "done")

	c.JSON(http.StatusOK, scriptResponse{
		ID:        scriptID,
		SessionID: sessionID,
		Code:      req.Code,
		Output:    resp.Messages,
		Status:    "done",
		Timestamp: now,
	})
}

func (h *Handler) List(c *router.Context) {
	sessionID := c.Param("sessionId")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "missing sessionId"})
		return
	}

	scripts, err := h.db.GetScripts(sessionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	type listItem struct {
		ID        string            `json:"id"`
		Code      string            `json:"code"`
		Output    []json.RawMessage `json:"output"`
		Status    string            `json:"status"`
		Timestamp int64             `json:"timestamp"`
	}

	result := make([]listItem, 0, len(scripts))
	for _, s := range scripts {
		item := listItem{
			ID:        s.ID,
			Code:      s.Code,
			Status:    s.Status,
			Timestamp: s.Timestamp,
		}
		if s.Output != nil {
			_ = json.Unmarshal([]byte(*s.Output), &item.Output)
		}
		result = append(result, item)
	}

	c.JSON(http.StatusOK, map[string]any{"scripts": result})
}
