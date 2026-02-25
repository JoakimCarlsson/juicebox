package scripts

import (
	"encoding/json"
	"net/http"

	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/scripting"
)

type Handler struct {
	files  *scripting.FileManager
	runner *scripting.Runner
}

func NewHandler(files *scripting.FileManager, runner *scripting.Runner) *Handler {
	return &Handler{files: files, runner: runner}
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

	f, err := h.files.Upsert(sessionID, req.Name, req.Content)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
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

	files, err := h.files.List(sessionID)
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

	if err := h.files.Delete(scriptID); err != nil {
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

	res, err := h.runner.Run(sessionID, req.Name, 5)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	if res.Error != "" {
		c.JSON(http.StatusInternalServerError, map[string]any{
			"id":        res.ID,
			"status":    "error",
			"error":     res.Error,
			"timestamp": res.Timestamp,
		})
		return
	}

	resp := map[string]any{
		"id":        res.ID,
		"fileId":    res.FileID,
		"fileName":  res.FileName,
		"output":    res.Messages,
		"status":    res.Status,
		"timestamp": res.Timestamp,
	}
	if res.Mode == "streaming" {
		resp["name"] = req.Name
	}

	c.JSON(http.StatusOK, resp)
}

func (h *Handler) ListRuns(c *router.Context) {
	sessionID := c.Param("sessionId")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "missing sessionId"})
		return
	}

	runs, err := h.runner.ListRuns(sessionID)
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
