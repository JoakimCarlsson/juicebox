package attach

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

	if deviceId == "" || bundleId == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "missing deviceId or bundleId"})
		return
	}

	resp, err := h.client.Attach(deviceId, bundleId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, AttachResponseBody{
		SessionID: resp.SessionID,
		PID:       resp.PID,
	})
}
