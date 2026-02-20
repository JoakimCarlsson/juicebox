package processes

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
	if deviceId == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "missing deviceId"})
		return
	}

	procs, err := h.client.ListProcesses(deviceId)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, ListProcessesResponse{Processes: procs})
}
