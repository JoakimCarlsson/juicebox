package settings

import (
	"github.com/joakimcarlsson/go-router/router/v2"
	"github.com/joakimcarlsson/juicebox/internal/db"
)

func RegisterRoutes(r *router.Router, database *db.DB) {
	h := NewHandler(database)

	r.GET("/settings", h.Get)
	r.PUT("/settings", h.Update)
	r.GET("/settings/models", h.Models)
}
