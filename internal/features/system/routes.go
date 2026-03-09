package system

import (
	"github.com/joakimcarlsson/go-router/router/v2"
	"github.com/joakimcarlsson/juicebox/internal/db"
	"github.com/joakimcarlsson/juicebox/internal/features/system/health"
)

func RegisterRoutes(r *router.Router, _ *db.DB) {
	h := health.NewHandler()
	r.GET("/healthz", h.Handle)
}
