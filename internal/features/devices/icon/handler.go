package icon

import (
	"net/http"

	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/bridge"
)

type Handler struct {
	client *bridge.Client
}

func NewHandler(client *bridge.Client) *Handler {
	return &Handler{client: client}
}

func (h *Handler) Handle(c *router.Context) {
	deviceId := c.Param("deviceId")
	bundleId := c.Param("bundleId")

	data, format, err := h.client.GetAppIcon(deviceId, bundleId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	contentType := "image/png"
	if format == "rgba" {
		contentType = "application/octet-stream"
	}

	c.Writer.Header().Set("Content-Type", contentType)
	c.Writer.Header().Set("Cache-Control", "public, max-age=3600")
	c.Writer.WriteHeader(http.StatusOK)
	c.Writer.Write(data)
}
