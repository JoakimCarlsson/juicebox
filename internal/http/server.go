package http

import (
	"io/fs"
	"net/http"
	"strings"

	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/bridge"
	"github.com/joakimcarlsson/juicebox/internal/db"
	"github.com/joakimcarlsson/juicebox/internal/devicehub"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/chat"
	"github.com/joakimcarlsson/juicebox/internal/session"
	webAssets "github.com/joakimcarlsson/juicebox/web"
)

type Server struct {
	router       *router.Router
	db           *db.DB
	bridgeClient *bridge.Client
	manager      *session.Manager
	hubManager   *devicehub.Manager
	chatStore    *chat.ChatSessionStore
}

func NewServer(
	db *db.DB,
	bridgeClient *bridge.Client,
	manager *session.Manager,
	hubManager *devicehub.Manager,
	chatStore *chat.ChatSessionStore,
) *Server {
	r := router.New()

	s := &Server{
		router:       r,
		db:           db,
		bridgeClient: bridgeClient,
		manager:      manager,
		hubManager:   hubManager,
		chatStore:    chatStore,
	}

	RegisterRoutes(
		r,
		db,
		bridgeClient,
		manager,
		hubManager,
		chatStore,
	)
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
		_, _ = c.Writer.Write(index)
	})
}
