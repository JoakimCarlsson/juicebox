package http

import (
	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/db"
	"github.com/joakimcarlsson/juicebox/internal/features/system"
)

func RegisterRoutes(r *router.Router, db *db.DB) {
	r.Group("/api/v1", func(api *router.Router) {
		system.RegisterRoutes(api, db)
	})
}
