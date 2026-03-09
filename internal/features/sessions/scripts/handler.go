package scripts

import (
	"encoding/json"
	"net/http"

	"github.com/joakimcarlsson/go-router/router/v2"
	"github.com/joakimcarlsson/juicebox/internal/response"
	"github.com/joakimcarlsson/juicebox/internal/scripting"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type Handler struct {
	files   *scripting.FileManager
	runner  *scripting.Runner
	manager *session.Manager
}

func NewHandler(
	files *scripting.FileManager,
	runner *scripting.Runner,
	manager *session.Manager,
) *Handler {
	return &Handler{files: files, runner: runner, manager: manager}
}

func (h *Handler) Upsert(c *router.Context) {
	deviceID := c.Param("deviceId")
	if deviceID == "" {
		response.Error(c, http.StatusBadRequest, "missing deviceId")
		return
	}

	var req upsertRequest
	if err := json.NewDecoder(c.Request.Body).Decode(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		response.Error(c, http.StatusBadRequest, "name is required")
		return
	}

	f, err := h.files.Upsert(deviceID, req.Name, req.Content)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.JSON(http.StatusOK, map[string]any{
		"id":        f.ID,
		"deviceId":  f.DeviceID,
		"name":      f.Name,
		"content":   f.Content,
		"createdAt": f.CreatedAt,
		"updatedAt": f.UpdatedAt,
	})
}

func (h *Handler) List(c *router.Context) {
	deviceID := c.Param("deviceId")
	if deviceID == "" {
		response.Error(c, http.StatusBadRequest, "missing deviceId")
		return
	}

	files, err := h.files.List(deviceID)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	result := make([]listItem, 0, len(files))
	for _, f := range files {
		result = append(result, listItem{
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
		response.Error(c, http.StatusBadRequest, "missing scriptId")
		return
	}

	if err := h.files.Delete(scriptID); err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.JSON(http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *Handler) Run(c *router.Context) {
	sessionID := c.Param("sessionId")
	if sessionID == "" {
		response.Error(c, http.StatusBadRequest, "missing sessionId")
		return
	}

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		response.Error(c, http.StatusNotFound, "session not found")
		return
	}

	var req runRequest
	if err := json.NewDecoder(c.Request.Body).Decode(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		response.Error(c, http.StatusBadRequest, "name is required")
		return
	}

	res, err := h.runner.Run(sessionID, sess.DeviceID, req.Name, 5)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
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
		response.Error(c, http.StatusBadRequest, "missing sessionId")
		return
	}

	runs, err := h.runner.ListRuns(sessionID)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	result := make([]listRunItem, 0, len(runs))
	for _, r := range runs {
		it := listRunItem{
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
