package db

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

type DB struct {
	Conn *sql.DB
}

func New(path string) (*DB, error) {
	conn, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("db.New: %w", err)
	}

	if err := conn.Ping(); err != nil {
		return nil, fmt.Errorf("db.New: %w", err)
	}

	return &DB{Conn: conn}, nil
}

func (d *DB) Close() error {
	return d.Conn.Close()
}
