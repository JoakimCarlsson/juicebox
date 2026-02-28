package db

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

type DB struct {
	conn *sql.DB
}

func New(path string) (*DB, error) {
	conn, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("db.New: %w", err)
	}

	if err := conn.Ping(); err != nil {
		return nil, fmt.Errorf("db.New: %w", err)
	}

	if _, err := conn.Exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=30000;"); err != nil {
		return nil, fmt.Errorf("db.New: pragmas: %w", err)
	}

	return &DB{conn: conn}, nil
}

func (d *DB) RawConn() *sql.DB {
	return d.conn
}

func (d *DB) Close() error {
	return d.conn.Close()
}
