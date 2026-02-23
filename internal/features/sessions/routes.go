package sessions

import (
	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/bridge"
	"github.com/joakimcarlsson/juicebox/internal/config"
	"github.com/joakimcarlsson/juicebox/internal/db"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/attach"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/chat"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/detach"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/list"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/logs"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/messages"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/rename"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

func RegisterRoutes(r *router.Router, manager *session.Manager, database *db.DB, bridgeClient *bridge.Client, appConfig *config.Config, chatStore *chat.ChatSessionStore) {
	attachHandler := attach.NewHandler(manager)
	detachHandler := detach.NewHandler(manager)
	listHandler := list.NewHandler(database)
	messagesHandler := messages.NewHandler(database)
	logsHandler := logs.NewHandler(database)
	renameHandler := rename.NewHandler(database)
	chatHandler := chat.NewHandler(database, bridgeClient, &appConfig.LLM, chatStore)

	r.POST("/devices/{deviceId}/apps/{bundleId}/attach", attachHandler.Handle)
	r.DELETE("/sessions/{sessionId}", detachHandler.Handle)
	r.PATCH("/sessions/{sessionId}", renameHandler.Handle)
	r.GET("/devices/{deviceId}/sessions", listHandler.Handle)
	r.GET("/sessions/{sessionId}/messages", messagesHandler.Handle)
	r.GET("/sessions/{sessionId}/logs", logsHandler.Handle)
	r.POST("/sessions/{sessionId}/chat", chatHandler.Handle)
	r.GET("/sessions/{sessionId}/chat/status", chatHandler.Status)
	r.GET("/sessions/{sessionId}/chat/history", chatHandler.History)
}
