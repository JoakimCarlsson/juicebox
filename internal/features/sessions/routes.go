package sessions

import (
	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/attach"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/detach"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

func RegisterRoutes(r *router.Router, manager *session.Manager) {
	attachHandler := attach.NewHandler(manager)
	detachHandler := detach.NewHandler(manager)

	r.POST("/devices/{deviceId}/apps/{bundleId}/attach", attachHandler.Handle)
	r.DELETE("/sessions/{sessionId}", detachHandler.Handle)
}
