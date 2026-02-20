package main

import (
	"log"
	"net/http"

	"github.com/joakimcarlsson/juicebox/internal/db"
	apphttp "github.com/joakimcarlsson/juicebox/internal/http"
)

func main() {
	database, err := db.New("juicebox.db")
	if err != nil {
		log.Fatal(err)
	}
	defer database.Close()

	srv := apphttp.NewServer(database)

	log.Println("juicebox listening on :8080")
	if err := http.ListenAndServe(":8080", srv.Router()); err != nil {
		log.Fatal(err)
	}
}
