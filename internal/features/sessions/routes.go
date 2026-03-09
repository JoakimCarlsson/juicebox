package sessions

import (
	"github.com/joakimcarlsson/go-router/router/v2"
	"github.com/joakimcarlsson/juicebox/internal/db"
	"github.com/joakimcarlsson/juicebox/internal/devicehub"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/chat"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/classes"
	clipboardpkg "github.com/joakimcarlsson/juicebox/internal/features/sessions/clipboard"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/conversations"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/crashes"
	cryptopkg "github.com/joakimcarlsson/juicebox/internal/features/sessions/crypto"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/detach"
	exportpkg "github.com/joakimcarlsson/juicebox/internal/features/sessions/export"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/filesystem"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/intercept"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/list"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/logs"
	memorypkg "github.com/joakimcarlsson/juicebox/internal/features/sessions/memory"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/messages"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/rename"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/scripts"
	sqlitepkg "github.com/joakimcarlsson/juicebox/internal/features/sessions/sqlite"
	"github.com/joakimcarlsson/juicebox/internal/scripting"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

func RegisterRoutes(
	r *router.Router,
	manager *session.Manager,
	database *db.DB,
	chatStore *chat.ChatSessionStore,
	hubManager *devicehub.Manager,
) {
	runner := scripting.NewRunner(database, manager)
	fileManager := scripting.NewFileManager(database, nil)
	scriptsHandler := scripts.NewHandler(fileManager, runner, manager)

	detachHandler := detach.NewHandler(manager)
	listHandler := list.NewHandler(database, manager)
	messagesHandler := messages.NewHandler(database)
	logsHandler := logs.NewHandler(database)
	renameHandler := rename.NewHandler(database)
	sqliteService := sqlitepkg.NewService()
	sqliteHandler := sqlitepkg.NewHandler(manager, sqliteService)
	chatHandler := chat.NewHandler(
		database,
		manager,
		chatStore,
		sqliteService,
		hubManager,
		runner,
	)
	interceptHandler := intercept.NewHandler(manager)
	fsHandler := filesystem.NewHandler(manager)
	classesHandler := classes.NewHandler(manager)
	crashesHandler := crashes.NewHandler(database)
	cryptoHandler := cryptopkg.NewHandler(database, manager)
	clipboardHandler := clipboardpkg.NewHandler(database, manager)
	memoryHandler := memorypkg.NewHandler(manager)
	exportHandler := exportpkg.NewHandler(database)
	convoHandler := conversations.NewHandler(database, chatStore)

	r.DELETE("/sessions/{sessionId}", detachHandler.Handle)
	r.PATCH("/sessions/{sessionId}", renameHandler.Handle)
	r.GET("/devices/{deviceId}/sessions", listHandler.Handle)
	r.GET("/sessions/{sessionId}/messages", messagesHandler.Handle)
	r.GET("/sessions/{sessionId}/logs", logsHandler.Handle)
	r.POST("/devices/{deviceId}/chat", chatHandler.Handle)
	r.GET("/devices/{deviceId}/chat/status", chatHandler.Status)
	r.GET("/devices/{deviceId}/chat/history", chatHandler.History)
	r.GET("/sessions/{sessionId}/intercept", interceptHandler.GetState)
	r.PUT("/sessions/{sessionId}/intercept", interceptHandler.UpdateState)
	r.GET(
		"/sessions/{sessionId}/intercept/pending",
		interceptHandler.ListPending,
	)
	r.POST("/sessions/{sessionId}/intercept/resolve", interceptHandler.Resolve)
	r.POST(
		"/sessions/{sessionId}/intercept/resolve-all",
		interceptHandler.ResolveAll,
	)

	r.GET("/sessions/{sessionId}/fs/ls", fsHandler.List)
	r.GET("/sessions/{sessionId}/fs/read", fsHandler.Read)
	r.GET("/sessions/{sessionId}/fs/find", fsHandler.Find)

	r.GET("/sessions/{sessionId}/sqlite/tables", sqliteHandler.Tables)
	r.POST("/sessions/{sessionId}/sqlite/query", sqliteHandler.Query)
	r.GET("/sessions/{sessionId}/sqlite/export", sqliteHandler.Export)

	r.GET("/sessions/{sessionId}/export", exportHandler.Handle)

	r.GET("/sessions/{sessionId}/crashes", crashesHandler.Handle)
	r.GET("/sessions/{sessionId}/crypto", cryptoHandler.Handle)
	r.POST("/sessions/{sessionId}/crypto/enable", cryptoHandler.Enable)
	r.GET("/sessions/{sessionId}/crypto/keystore", cryptoHandler.Keystore)
	r.GET("/sessions/{sessionId}/crypto/sharedprefs", cryptoHandler.SharedPrefs)

	r.GET("/sessions/{sessionId}/clipboard", clipboardHandler.Handle)
	r.POST("/sessions/{sessionId}/clipboard/enable", clipboardHandler.Enable)
	r.POST("/sessions/{sessionId}/clipboard/disable", clipboardHandler.Disable)

	r.GET("/sessions/{sessionId}/classes", classesHandler.List)
	r.GET("/sessions/{sessionId}/classes/detail", classesHandler.Detail)
	r.POST("/sessions/{sessionId}/classes/invoke", classesHandler.Invoke)
	r.POST("/sessions/{sessionId}/classes/read-field", classesHandler.ReadField)

	r.POST("/sessions/{sessionId}/memory/scan", memoryHandler.Scan)
	r.DELETE("/sessions/{sessionId}/memory/scan", memoryHandler.StopScan)
	r.POST("/sessions/{sessionId}/memory/dump", memoryHandler.Dump)

	r.POST("/devices/{deviceId}/scripts", scriptsHandler.Upsert)
	r.GET("/devices/{deviceId}/scripts", scriptsHandler.List)
	r.DELETE("/devices/{deviceId}/scripts/{scriptId}", scriptsHandler.Delete)
	r.POST("/sessions/{sessionId}/scripts/run", scriptsHandler.Run)
	r.GET("/sessions/{sessionId}/scripts/runs", scriptsHandler.ListRuns)

	r.GET("/devices/{deviceId}/conversations", convoHandler.List)
	r.POST("/devices/{deviceId}/conversations", convoHandler.Create)
	r.PATCH("/conversations/{conversationId}", convoHandler.Update)
	r.DELETE("/conversations/{conversationId}", convoHandler.Delete)
}
