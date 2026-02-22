package main

import (
	"log"
	"log/slog"
	"net/http"
	"os"

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

	manager := session.NewManager(certManager, bridgeClient, hubManager)

	srv := apphttp.NewServer(database, bridgeClient, manager, hubManager)

	if err := http.ListenAndServe(":8080", srv.Router()); err != nil {
		log.Fatal(err)
	}
}
