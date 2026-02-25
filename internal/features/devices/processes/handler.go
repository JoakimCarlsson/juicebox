package processes

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
	if deviceID == "" {
		response.Error(c, http.StatusBadRequest, "missing deviceId")
		return
	}

	procs, err := h.client.ListProcesses(deviceID)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.JSON(http.StatusOK, ListProcessesResponse{Processes: procs})
}
