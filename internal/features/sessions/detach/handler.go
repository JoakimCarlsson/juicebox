package detach

import (
	"net/http"

	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type Handler struct {
	manager *session.Manager
}

func NewHandler(manager *session.Manager) *Handler {
	return &Handler{manager: manager}
}

func (h *Handler) Handle(c *router.Context) {
	sessionId := c.Param("sessionId")
	if sessionId == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "missing sessionId"})
		return
	}

	if err := h.manager.Detach(sessionId); err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, map[string]string{"status": "detached"})
}
