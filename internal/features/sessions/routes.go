package sessions

import (
	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/bridge"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/attach"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/detach"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/stream"
)

func RegisterRoutes(r *router.Router, client *bridge.Client) {
	attachHandler := attach.NewHandler(client)
	detachHandler := detach.NewHandler(client)
	streamHandler := stream.NewHandler(client)

	r.POST("/devices/{deviceId}/apps/{bundleId}/attach", attachHandler.Handle)
	r.DELETE("/sessions/{sessionId}", detachHandler.Handle)
	r.GET("/ws/sessions/{sessionId}", streamHandler.Handle)
}
