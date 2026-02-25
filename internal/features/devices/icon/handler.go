package icon

import (
	"net/http"

	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/bridge"
	"github.com/joakimcarlsson/juicebox/internal/response"
)

type Handler struct {
	client *bridge.Client
}

func NewHandler(client *bridge.Client) *Handler {
	return &Handler{client: client}
}

func (h *Handler) Handle(c *router.Context) {
	deviceID := c.Param("deviceId")
	bundleID := c.Param("bundleId")

	data, format, err := h.client.GetAppIcon(deviceID, bundleID)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
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
