package devices

import (
	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/bridge"
	"github.com/joakimcarlsson/juicebox/internal/features/devices/apps"
	"github.com/joakimcarlsson/juicebox/internal/features/devices/icon"
	"github.com/joakimcarlsson/juicebox/internal/features/devices/info"
	"github.com/joakimcarlsson/juicebox/internal/features/devices/list"
	"github.com/joakimcarlsson/juicebox/internal/features/devices/processes"
)

func RegisterRoutes(r *router.Router, client *bridge.Client) {
	listHandler := list.NewHandler(client)
	appsHandler := apps.NewHandler(client)
	infoHandler := info.NewHandler(client)
	iconHandler := icon.NewHandler(client)
	processesHandler := processes.NewHandler(client)

	r.Group("/devices", func(d *router.Router) {
		d.GET("", listHandler.Handle)
		d.GET("/{deviceId}/apps", appsHandler.Handle)
		d.GET("/{deviceId}/processes", processesHandler.Handle)
		d.GET("/{deviceId}/info", infoHandler.Handle)
		d.GET("/{deviceId}/icon/{bundleId}", iconHandler.Handle)
	})
}
