package http

import (
	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/bridge"
	"github.com/joakimcarlsson/juicebox/internal/config"
	"github.com/joakimcarlsson/juicebox/internal/db"
	"github.com/joakimcarlsson/juicebox/internal/devicehub"
	"github.com/joakimcarlsson/juicebox/internal/features/devices"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/chat"
	"github.com/joakimcarlsson/juicebox/internal/features/system"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

func RegisterRoutes(r *router.Router, db *db.DB, bridgeClient *bridge.Client, manager *session.Manager, hubManager *devicehub.Manager, appConfig *config.Config, chatStore *chat.ChatSessionStore) {
	r.Group("/api/v1", func(api *router.Router) {
		system.RegisterRoutes(api, db)
		devices.RegisterRoutes(api, bridgeClient, hubManager, manager)
		sessions.RegisterRoutes(api, manager, db, bridgeClient, appConfig, chatStore)
	})
}
