package db

import (
	"database/sql"
	"fmt"
)

type CrashRow struct {
	ID               string
	SessionID        string
	CrashType        string
	Signal           *string
	Address          *string
	Registers        *string
	Backtrace        *string
	JavaStackTrace   *string
	ExceptionClass   *string
	ExceptionMessage *string
	Timestamp        int64
}

func (d *DB) InsertCrash(c *CrashRow) error {
	_, err := d.conn.Exec(
		`INSERT INTO crashes (id, session_id, crash_type, signal, address, registers, backtrace, java_stack_trace, exception_class, exception_message, timestamp)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		c.ID,
		c.SessionID,
		c.CrashType,
		c.Signal,
		c.Address,
		c.Registers,
		c.Backtrace,
		c.JavaStackTrace,
		c.ExceptionClass,
		c.ExceptionMessage,
		c.Timestamp,
	)
	if err != nil {
		return fmt.Errorf("db.InsertCrash: %w", err)
	}
	return nil
}

func (d *DB) ListCrashes(
	sessionID string,
	limit, offset int,
) ([]CrashRow, error) {
	rows, err := d.conn.Query(
		`SELECT id, session_id, crash_type, signal, address, registers, backtrace, java_stack_trace, exception_class, exception_message, timestamp
		 FROM crashes WHERE session_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
		sessionID,
		limit,
		offset,
	)
	if err != nil {
		return nil, fmt.Errorf("db.ListCrashes: %w", err)
	}
	defer rows.Close()
	return scanCrashes(rows)
}

func (d *DB) CountCrashes(sessionID string) (int, error) {
	var count int
	err := d.conn.QueryRow(`SELECT COUNT(*) FROM crashes WHERE session_id = ?`, sessionID).
		Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("db.CountCrashes: %w", err)
	}
	return count, nil
}

func (d *DB) SearchCrashes(
	sessionID string,
	sinceTimestamp int64,
	limit int,
) ([]CrashRow, error) {
	query := `SELECT id, session_id, crash_type, signal, address, registers, backtrace, java_stack_trace, exception_class, exception_message, timestamp
		 FROM crashes WHERE session_id = ?`
	args := []any{sessionID}

	if sinceTimestamp > 0 {
		query += ` AND timestamp >= ?`
		args = append(args, sinceTimestamp)
	}

	if limit <= 0 {
		limit = 50
	}
	query += ` ORDER BY timestamp DESC LIMIT ?`
	args = append(args, limit)

	rows, err := d.conn.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("db.SearchCrashes: %w", err)
	}
	defer rows.Close()
	return scanCrashes(rows)
}

func scanCrashes(rows *sql.Rows) ([]CrashRow, error) {
	var result []CrashRow
	for rows.Next() {
		var c CrashRow
		if err := rows.Scan(
			&c.ID, &c.SessionID, &c.CrashType, &c.Signal, &c.Address,
			&c.Registers, &c.Backtrace, &c.JavaStackTrace,
			&c.ExceptionClass, &c.ExceptionMessage, &c.Timestamp,
		); err != nil {
			return nil, err
		}
		result = append(result, c)
	}
	return result, rows.Err()
}
