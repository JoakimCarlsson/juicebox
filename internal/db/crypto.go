package db

import (
	"database/sql"
	"fmt"
)

type CryptoEventRow struct {
	ID        string
	SessionID string
	Operation string
	Algorithm string
	Input     *string
	Output    *string
	Key       *string
	IV        *string
	Timestamp int64
}

func (d *DB) InsertCryptoEvent(c *CryptoEventRow) error {
	_, err := d.conn.Exec(
		`INSERT INTO crypto_events (id, session_id, operation, algorithm, input, output, key, iv, timestamp)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		c.ID, c.SessionID, c.Operation, c.Algorithm, c.Input, c.Output, c.Key, c.IV, c.Timestamp,
	)
	if err != nil {
		return fmt.Errorf("db.InsertCryptoEvent: %w", err)
	}
	return nil
}

func (d *DB) ListCryptoEvents(sessionID string, limit, offset int) ([]CryptoEventRow, error) {
	rows, err := d.conn.Query(
		`SELECT id, session_id, operation, algorithm, input, output, key, iv, timestamp
		 FROM crypto_events WHERE session_id = ? ORDER BY timestamp ASC LIMIT ? OFFSET ?`,
		sessionID, limit, offset,
	)
	if err != nil {
		return nil, fmt.Errorf("db.ListCryptoEvents: %w", err)
	}
	defer rows.Close()
	return scanCryptoEvents(rows)
}

func (d *DB) CountCryptoEvents(sessionID string) (int, error) {
	var count int
	err := d.conn.QueryRow(`SELECT COUNT(*) FROM crypto_events WHERE session_id = ?`, sessionID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("db.CountCryptoEvents: %w", err)
	}
	return count, nil
}

func (d *DB) SearchCryptoEvents(sessionID, algorithm, operation string, limit int) ([]CryptoEventRow, error) {
	query := `SELECT id, session_id, operation, algorithm, input, output, key, iv, timestamp
		 FROM crypto_events WHERE session_id = ?`
	args := []any{sessionID}

	if algorithm != "" {
		query += ` AND algorithm LIKE ?`
		args = append(args, "%"+algorithm+"%")
	}
	if operation != "" {
		query += ` AND operation = ?`
		args = append(args, operation)
	}

	if limit <= 0 {
		limit = 50
	}
	query += ` ORDER BY timestamp DESC LIMIT ?`
	args = append(args, limit)

	rows, err := d.conn.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("db.SearchCryptoEvents: %w", err)
	}
	defer rows.Close()
	return scanCryptoEvents(rows)
}

func scanCryptoEvents(rows *sql.Rows) ([]CryptoEventRow, error) {
	var result []CryptoEventRow
	for rows.Next() {
		var c CryptoEventRow
		if err := rows.Scan(
			&c.ID, &c.SessionID, &c.Operation, &c.Algorithm,
			&c.Input, &c.Output, &c.Key, &c.IV, &c.Timestamp,
		); err != nil {
			return nil, err
		}
		result = append(result, c)
	}
	return result, rows.Err()
}
