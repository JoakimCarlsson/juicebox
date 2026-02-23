package filesystem

import (
	"encoding/base64"
	"net/http"
	"path/filepath"

	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/bridge"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type Handler struct {
	bridge  *bridge.Client
	manager *session.Manager
}

func NewHandler(bridgeClient *bridge.Client, manager *session.Manager) *Handler {
	return &Handler{bridge: bridgeClient, manager: manager}
}

func (h *Handler) List(c *router.Context) {
	sessionID := c.Param("sessionId")
	path := c.QueryDefault("path", "")

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		c.JSON(http.StatusNotFound, map[string]string{"error": "session not found"})
		return
	}

	if path == "" {
		path = "/data/data/" + sess.BundleID
	}

	entries, err := h.bridge.ListFiles(sess.DeviceID, sess.BundleID, path)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, ListResponse{Path: path, Entries: entries})
}

func (h *Handler) Read(c *router.Context) {
	sessionID := c.Param("sessionId")
	path := c.QueryDefault("path", "")

	if path == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "path is required"})
		return
	}

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		c.JSON(http.StatusNotFound, map[string]string{"error": "session not found"})
		return
	}

	content, err := h.bridge.ReadFile(sess.DeviceID, sess.BundleID, path)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	if content.Encoding == "base64" {
		data, err := base64.StdEncoding.DecodeString(content.Content)
		if err != nil {
			c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to decode file"})
			return
		}
		filename := filepath.Base(path)
		c.Writer.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
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
		c.JSON(http.StatusBadRequest, map[string]string{"error": "pattern is required"})
		return
	}

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		c.JSON(http.StatusNotFound, map[string]string{"error": "session not found"})
		return
	}

	if basePath == "" {
		basePath = "/data/data/" + sess.BundleID
	}

	paths, err := h.bridge.FindFiles(sess.DeviceID, sess.BundleID, pattern, basePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, FindResponse{Pattern: pattern, BasePath: basePath, Paths: paths})
}
