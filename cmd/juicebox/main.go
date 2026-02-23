package main

import (
	"context"
	"log"
	"log/slog"
	"net/http"
	"os"
	"time"

	sqlitestore "github.com/joakimcarlsson/ai/integrations/sqlite"
	"github.com/joakimcarlsson/juicebox/internal/bridge"
	"github.com/joakimcarlsson/juicebox/internal/config"
	"github.com/joakimcarlsson/juicebox/internal/db"
	"github.com/joakimcarlsson/juicebox/internal/devicehub"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/chat"
	apphttp "github.com/joakimcarlsson/juicebox/internal/http"
	"github.com/joakimcarlsson/juicebox/internal/otel"
	"github.com/joakimcarlsson/juicebox/internal/proxy"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

func main() {
	appConfig := config.Load()

	database, err := db.New("juicebox.db")
	if err != nil {
		log.Fatal(err)
	}
	defer database.Close()

	if err := database.Migrate(); err != nil {
		log.Fatal("migration failed: ", err)
	}

	if n, err := database.CloseOrphanedSessions(time.Now().UnixMilli()); err != nil {
		slog.Warn("failed to close orphaned sessions", "error", err)
	} else if n > 0 {
		slog.Info("closed orphaned sessions", "count", n)
	}

	writer := db.NewAsyncWriter(database, 4096)
	defer writer.Close()

	socketPath := os.Getenv("JUICEBOX_SOCKET")
	if socketPath == "" {
		socketPath = "/tmp/juicebox.sock"
	}

	bridgeClient := bridge.NewClient(socketPath)

	certManager, err := proxy.NewCertManager("data")
	if err != nil {
		log.Fatal(err)
	}
	hubManager := devicehub.NewManager()
	otel.SetupLogger("juicebox", "info", "json", hubManager)

	slog.Info("CA certificate ready", "path", certManager.CAPEMPath())

	if appConfig.LLM.Configured() {
		slog.Info("LLM provider configured", "provider", appConfig.LLM.Provider)
	} else {
		slog.Info("LLM provider not configured, AI chat disabled")
	}

	manager := session.NewManager(certManager, bridgeClient, hubManager, database, writer)

	chatSessionStore, err := sqlitestore.SessionStore(context.Background(), database.Conn,
		sqlitestore.WithTablePrefix("chat_"),
	)
	if err != nil {
		log.Fatal("chat session store: ", err)
	}
	chatStore := chat.NewChatSessionStore(chatSessionStore)

	srv := apphttp.NewServer(database, bridgeClient, manager, hubManager, appConfig, chatStore)

	if err := http.ListenAndServe(":8080", srv.Router()); err != nil {
		log.Fatal(err)
	}
}
