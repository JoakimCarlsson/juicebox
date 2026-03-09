package health

import (
	"net/http"

	"github.com/joakimcarlsson/go-router/router/v2"
)

type Handler struct{}

func NewHandler() *Handler {
	return &Handler{}
}

func (h *Handler) Handle(c *router.Context) {
	c.JSON(http.StatusOK, HealthResponse{
		Status: "ok",
	})
}
