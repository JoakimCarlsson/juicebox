package main

import (
	"log"
	"net/http"
	"os"

	"github.com/joakimcarlsson/juicebox/internal/bridge"
	"github.com/joakimcarlsson/juicebox/internal/db"
	apphttp "github.com/joakimcarlsson/juicebox/internal/http"
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

	srv := apphttp.NewServer(database, bridgeClient)

	if err := http.ListenAndServe(":8080", srv.Router()); err != nil {
		log.Fatal(err)
	}
}
