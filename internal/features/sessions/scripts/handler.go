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

type upsertRequest struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

type runRequest struct {
	Name string `json:"name"`
}

func (h *Handler) Upsert(c *router.Context) {
	sessionID := c.Param("sessionId")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "missing sessionId"})
		return
	}

	var req upsertRequest
	if err := json.NewDecoder(c.Request.Body).Decode(&req); err != nil {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if req.Name == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "name is required"})
		return
	}

	now := time.Now().UnixMilli()
	fileID := fmt.Sprintf("sf_%d", time.Now().UnixNano())

	if err := h.db.UpsertScriptFile(db.ScriptFileRow{
		ID:        fileID,
		SessionID: sessionID,
		Name:      req.Name,
		Content:   req.Content,
		CreatedAt: now,
		UpdatedAt: now,
	}); err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	f, _ := h.db.GetScriptFile(sessionID, req.Name)
	if f == nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to read back script file"})
		return
	}

	c.JSON(http.StatusOK, map[string]any{
		"id":        f.ID,
		"sessionId": f.SessionID,
		"name":      f.Name,
		"content":   f.Content,
		"createdAt": f.CreatedAt,
		"updatedAt": f.UpdatedAt,
	})
}

func (h *Handler) List(c *router.Context) {
	sessionID := c.Param("sessionId")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "missing sessionId"})
		return
	}

	files, err := h.db.GetScriptFiles(sessionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	type item struct {
		ID        string `json:"id"`
		Name      string `json:"name"`
		Content   string `json:"content"`
		CreatedAt int64  `json:"createdAt"`
		UpdatedAt int64  `json:"updatedAt"`
	}

	result := make([]item, 0, len(files))
	for _, f := range files {
		result = append(result, item{
			ID:        f.ID,
			Name:      f.Name,
			Content:   f.Content,
			CreatedAt: f.CreatedAt,
			UpdatedAt: f.UpdatedAt,
		})
	}

	c.JSON(http.StatusOK, map[string]any{"files": result})
}

func (h *Handler) Delete(c *router.Context) {
	scriptID := c.Param("scriptId")
	if scriptID == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "missing scriptId"})
		return
	}

	if err := h.db.DeleteScriptFile(scriptID); err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
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
	if req.Name == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "name is required"})
		return
	}

	file, err := h.db.GetScriptFile(sessionID, req.Name)
	if err != nil || file == nil {
		c.JSON(http.StatusNotFound, map[string]string{"error": "script file not found"})
		return
	}

	liveSess := h.manager.GetSession(sessionID)
	if liveSess == nil {
		c.JSON(http.StatusNotFound, map[string]string{"error": "active session not found"})
		return
	}

	runID := fmt.Sprintf("sr_%d", time.Now().UnixNano())
	now := time.Now().UnixMilli()

	_ = h.db.InsertScriptRun(db.ScriptRunRow{
		ID:           runID,
		SessionID:    sessionID,
		ScriptFileID: file.ID,
		Status:       "running",
		Timestamp:    now,
	})

	resp, err := h.manager.RunScript(sessionID, file.Content, 30)
	if err != nil {
		_ = h.db.UpdateScriptRun(runID, "", "error")
		c.JSON(http.StatusInternalServerError, map[string]any{
			"id":        runID,
			"status":    "error",
			"error":     err.Error(),
			"timestamp": now,
		})
		return
	}

	outputJSON, _ := json.Marshal(resp.Messages)
	_ = h.db.UpdateScriptRun(runID, string(outputJSON), "done")

	c.JSON(http.StatusOK, map[string]any{
		"id":        runID,
		"fileId":    file.ID,
		"fileName":  file.Name,
		"output":    resp.Messages,
		"status":    "done",
		"timestamp": now,
	})
}

func (h *Handler) ListRuns(c *router.Context) {
	sessionID := c.Param("sessionId")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "missing sessionId"})
		return
	}

	runs, err := h.db.GetScriptRuns(sessionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	type item struct {
		ID           string            `json:"id"`
		ScriptFileID string            `json:"scriptFileId"`
		Output       []json.RawMessage `json:"output"`
		Status       string            `json:"status"`
		Timestamp    int64             `json:"timestamp"`
	}

	result := make([]item, 0, len(runs))
	for _, r := range runs {
		it := item{
			ID:           r.ID,
			ScriptFileID: r.ScriptFileID,
			Status:       r.Status,
			Timestamp:    r.Timestamp,
		}
		if r.Output != nil {
			_ = json.Unmarshal([]byte(*r.Output), &it.Output)
		}
		result = append(result, it)
	}

	c.JSON(http.StatusOK, map[string]any{"runs": result})
}
