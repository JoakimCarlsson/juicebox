package main

import (
	"log"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/joakimcarlsson/juicebox/internal/bridge"
	"github.com/joakimcarlsson/juicebox/internal/db"
	"github.com/joakimcarlsson/juicebox/internal/devicehub"
	apphttp "github.com/joakimcarlsson/juicebox/internal/http"
	"github.com/joakimcarlsson/juicebox/internal/otel"
	"github.com/joakimcarlsson/juicebox/internal/proxy"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

func main() {
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

	manager := session.NewManager(certManager, bridgeClient, hubManager, database, writer)

	srv := apphttp.NewServer(database, bridgeClient, manager, hubManager)

	if err := http.ListenAndServe(":8080", srv.Router()); err != nil {
		log.Fatal(err)
	}
}
