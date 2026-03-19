package devices

import (
	"github.com/joakimcarlsson/go-router/router/v2"
	"github.com/joakimcarlsson/juicebox/internal/bridge"
	"github.com/joakimcarlsson/juicebox/internal/db"
	"github.com/joakimcarlsson/juicebox/internal/devicehub"
	"github.com/joakimcarlsson/juicebox/internal/features/devices/apps"
	"github.com/joakimcarlsson/juicebox/internal/features/devices/attach"
	"github.com/joakimcarlsson/juicebox/internal/features/devices/connect"
	"github.com/joakimcarlsson/juicebox/internal/features/devices/data"
	"github.com/joakimcarlsson/juicebox/internal/features/devices/disconnect"
	"github.com/joakimcarlsson/juicebox/internal/features/devices/icon"
	"github.com/joakimcarlsson/juicebox/internal/features/devices/info"
	"github.com/joakimcarlsson/juicebox/internal/features/devices/list"
	"github.com/joakimcarlsson/juicebox/internal/features/devices/processes"
	"github.com/joakimcarlsson/juicebox/internal/features/devices/spawn"
	"github.com/joakimcarlsson/juicebox/internal/features/devices/stream"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

func RegisterRoutes(
	r *router.Router,
	client *bridge.Client,
	hubManager *devicehub.Manager,
	sessionManager *session.Manager,
	database *db.DB,
) {
	listHandler := list.NewHandler(client)
	appsHandler := apps.NewHandler(client)
	infoHandler := info.NewHandler(client)
	iconHandler := icon.NewHandler(client)
	processesHandler := processes.NewHandler(client)
	streamHandler := stream.NewHandler(hubManager, sessionManager)
	connectHandler := connect.NewHandler(sessionManager)
	disconnectHandler := disconnect.NewHandler(sessionManager)
	spawnHandler := spawn.NewHandler(sessionManager)
	attachHandler := attach.NewHandler(sessionManager)
	dataHandler := data.NewHandler(database)

	r.Group("/devices", func(d *router.Router) {
		d.GET("", listHandler.Handle)
		d.GET("/{deviceId}/apps", appsHandler.Handle)
		d.GET("/{deviceId}/processes", processesHandler.Handle)
		d.GET("/{deviceId}/info", infoHandler.Handle)
		d.GET("/{deviceId}/icon/{bundleId}", iconHandler.Handle)
		d.POST("/{deviceId}/connect", connectHandler.Handle)
		d.DELETE("/{deviceId}/disconnect", disconnectHandler.Handle)
		d.POST("/{deviceId}/spawn", spawnHandler.Handle)
		d.POST("/{deviceId}/attach", attachHandler.Handle)
		d.GET("/{deviceId}/data/messages", dataHandler.Messages)
		d.DELETE("/{deviceId}/data/messages", dataHandler.ClearMessages)
		d.GET("/{deviceId}/data/logs", dataHandler.Logs)
		d.DELETE("/{deviceId}/data/logs", dataHandler.ClearLogs)
		d.GET("/{deviceId}/data/crashes", dataHandler.Crashes)
		d.DELETE("/{deviceId}/data/crashes", dataHandler.ClearCrashes)
		d.GET("/{deviceId}/data/crypto", dataHandler.Crypto)
		d.DELETE("/{deviceId}/data/crypto", dataHandler.ClearCrypto)
		d.GET("/{deviceId}/data/clipboard", dataHandler.Clipboard)
		d.DELETE("/{deviceId}/data/clipboard", dataHandler.ClearClipboard)
		d.GET("/{deviceId}/data/flutter-channels", dataHandler.FlutterChannels)
		d.DELETE(
			"/{deviceId}/data/flutter-channels",
			dataHandler.ClearFlutterChannels,
		)
		d.GET("/{deviceId}/data/findings", dataHandler.Findings)
		d.DELETE("/{deviceId}/data/findings", dataHandler.ClearFindings)
	})
	r.GET("/ws/devices/{deviceId}", streamHandler.Handle)
}
