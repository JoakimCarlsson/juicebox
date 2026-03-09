package connect

import (
	"net/http"

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

func (h *Handler) Handle(c *router.Context) {
	deviceID := c.Param("deviceId")
	if deviceID == "" {
		response.Error(c, http.StatusBadRequest, "missing deviceId")
		return
	}

	result, err := h.manager.ConnectDevice(deviceID)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.JSON(http.StatusOK, result)
}
