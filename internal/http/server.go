package http

import (
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/bridge"
	"github.com/joakimcarlsson/juicebox/internal/db"
	webAssets "github.com/joakimcarlsson/juicebox/web"
)

type Server struct {
	router       *router.Router
	db           *db.DB
	bridgeClient *bridge.Client
}

func NewServer(db *db.DB, bridgeClient *bridge.Client) *Server {
	r := router.New()

	s := &Server{
		router:       r,
		db:           db,
		bridgeClient: bridgeClient,
	}

	RegisterRoutes(r, db, bridgeClient)
	s.serveSPA(r)

	return s
}

func (s *Server) Router() http.Handler {
	return s.router
}

func (s *Server) serveSPA(r *router.Router) {
	dist, err := fs.Sub(webAssets.Assets, "dist")
	if err != nil {
		panic(err)
	}

	fileServer := http.FileServer(http.FS(dist))

	r.GET("/{filepath...}", func(c *router.Context) {
		fp := c.Param("filepath")

		if fp != "" && !strings.HasPrefix(fp, "..") {
			if _, err := fs.Stat(dist, fp); err == nil {
				c.Request.URL.Path = "/" + fp
				fileServer.ServeHTTP(c.Writer, c.Request)
				return
			}
		}

		index, err := fs.ReadFile(dist, "index.html")
		if err != nil {
			c.Error(http.StatusInternalServerError, "index.html not found")
			return
		}

		c.Writer.Header().Set("Content-Type", "text/html; charset=utf-8")
		c.Writer.Write(index)
	})
}

func serveSPAFromDisk(r *router.Router, dir string) {
	r.GET("/{filepath...}", func(c *router.Context) {
		fp := c.Param("filepath")
		fullPath := filepath.Join(dir, fp)

		if !strings.HasPrefix(filepath.Clean(fullPath), filepath.Clean(dir)) {
			c.JSON(http.StatusForbidden, map[string]string{"error": "access denied"})
			return
		}

		info, err := os.Stat(fullPath)
		if err != nil || info.IsDir() {
			c.File(filepath.Join(dir, "index.html"))
			return
		}

		c.File(fullPath)
	})
}
