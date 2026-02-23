package sessions

import (
	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/config"
	"github.com/joakimcarlsson/juicebox/internal/db"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/attach"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/chat"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/detach"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/filesystem"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/intercept"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/list"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/logs"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/messages"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/rename"
	sqlitepkg "github.com/joakimcarlsson/juicebox/internal/features/sessions/sqlite"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

func RegisterRoutes(r *router.Router, manager *session.Manager, database *db.DB, appConfig *config.Config, chatStore *chat.ChatSessionStore) {
	attachHandler := attach.NewHandler(manager)
	detachHandler := detach.NewHandler(manager)
	listHandler := list.NewHandler(database, manager)
	messagesHandler := messages.NewHandler(database)
	logsHandler := logs.NewHandler(database)
	renameHandler := rename.NewHandler(database)
	sqliteHandler := sqlitepkg.NewHandler(manager)
	chatHandler := chat.NewHandler(database, manager, &appConfig.LLM, chatStore, sqliteHandler)
	interceptHandler := intercept.NewHandler(manager)
	fsHandler := filesystem.NewHandler(manager)

	r.POST("/devices/{deviceId}/apps/{bundleId}/attach", attachHandler.Handle)
	r.DELETE("/sessions/{sessionId}", detachHandler.Handle)
	r.PATCH("/sessions/{sessionId}", renameHandler.Handle)
	r.GET("/devices/{deviceId}/sessions", listHandler.Handle)
	r.GET("/sessions/{sessionId}/messages", messagesHandler.Handle)
	r.GET("/sessions/{sessionId}/logs", logsHandler.Handle)
	r.POST("/sessions/{sessionId}/chat", chatHandler.Handle)
	r.GET("/sessions/{sessionId}/chat/status", chatHandler.Status)
	r.GET("/sessions/{sessionId}/chat/history", chatHandler.History)
	r.GET("/sessions/{sessionId}/intercept", interceptHandler.GetState)
	r.PUT("/sessions/{sessionId}/intercept", interceptHandler.UpdateState)
	r.GET("/sessions/{sessionId}/intercept/pending", interceptHandler.ListPending)
	r.POST("/sessions/{sessionId}/intercept/resolve", interceptHandler.Resolve)
	r.POST("/sessions/{sessionId}/intercept/resolve-all", interceptHandler.ResolveAll)

	r.GET("/sessions/{sessionId}/fs/ls", fsHandler.List)
	r.GET("/sessions/{sessionId}/fs/read", fsHandler.Read)
	r.GET("/sessions/{sessionId}/fs/find", fsHandler.Find)

	r.GET("/sessions/{sessionId}/sqlite/tables", sqliteHandler.Tables)
	r.POST("/sessions/{sessionId}/sqlite/query", sqliteHandler.Query)
	r.GET("/sessions/{sessionId}/sqlite/export", sqliteHandler.Export)
}
