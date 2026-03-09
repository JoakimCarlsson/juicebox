package filesystem

import (
	"encoding/base64"
	"net/http"
	"path/filepath"

	"github.com/joakimcarlsson/go-router/router/v2"
	"github.com/joakimcarlsson/juicebox/internal/response"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type Handler struct {
	manager *session.Manager
}

func NewHandler(manager *session.Manager) *Handler {
	return &Handler{manager: manager}
}

func (h *Handler) List(c *router.Context) {
	sessionID := c.Param("sessionId")
	path := c.QueryDefault("path", "")

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		response.Error(c, http.StatusNotFound, "session not found")
		return
	}

	dc := h.manager.GetDeviceConnection(sess.DeviceID)
	if dc == nil {
		response.Error(c, http.StatusNotFound, "device not connected")
		return
	}

	if path == "" {
		path = "/data/data/" + sess.BundleID
	}

	entries, err := dc.Setup.ListFiles(sess.DeviceID, sess.BundleID, path)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.JSON(http.StatusOK, ListResponse{Path: path, Entries: entries})
}

func (h *Handler) Read(c *router.Context) {
	sessionID := c.Param("sessionId")
	path := c.QueryDefault("path", "")

	if path == "" {
		response.Error(c, http.StatusBadRequest, "path is required")
		return
	}

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		response.Error(c, http.StatusNotFound, "session not found")
		return
	}

	dc := h.manager.GetDeviceConnection(sess.DeviceID)
	if dc == nil {
		response.Error(c, http.StatusNotFound, "device not connected")
		return
	}

	content, err := dc.Setup.ReadFile(sess.DeviceID, sess.BundleID, path)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	if content.Encoding == "base64" {
		data, err := base64.StdEncoding.DecodeString(content.Content)
		if err != nil {
			response.Error(
				c,
				http.StatusInternalServerError,
				"failed to decode file",
			)
			return
		}
		filename := filepath.Base(path)
		c.Writer.Header().
			Set("Content-Disposition", `attachment; filename="`+filename+`"`)
		c.Writer.Header().Set("Content-Type", "application/octet-stream")
		c.Writer.WriteHeader(http.StatusOK)
		c.Writer.Write(data) //nolint:errcheck
		return
	}

	c.JSON(http.StatusOK, content)
}

func (h *Handler) Find(c *router.Context) {
	sessionID := c.Param("sessionId")
	pattern := c.QueryDefault("pattern", "")
	basePath := c.QueryDefault("basePath", "")

	if pattern == "" {
		response.Error(c, http.StatusBadRequest, "pattern is required")
		return
	}

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		response.Error(c, http.StatusNotFound, "session not found")
		return
	}

	dc := h.manager.GetDeviceConnection(sess.DeviceID)
	if dc == nil {
		response.Error(c, http.StatusNotFound, "device not connected")
		return
	}

	if basePath == "" {
		basePath = "/data/data/" + sess.BundleID
	}

	paths, err := dc.Setup.FindFiles(
		sess.DeviceID,
		sess.BundleID,
		pattern,
		basePath,
	)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.JSON(
		http.StatusOK,
		FindResponse{Pattern: pattern, BasePath: basePath, Paths: paths},
	)
}
