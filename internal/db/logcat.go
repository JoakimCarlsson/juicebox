package db

import "fmt"

type LogcatEntryRow struct {
	ID        string
	SessionID string
	Timestamp string
	PID       int
	TID       int
	Level     string
	Tag       string
	Message   string
}

func (d *DB) InsertLogcatEntry(e *LogcatEntryRow) error {
	_, err := d.conn.Exec(
		`INSERT INTO logcat_entries (id, session_id, timestamp, pid, tid, level, tag, message)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		e.ID, e.SessionID, e.Timestamp, e.PID, e.TID, e.Level, e.Tag, e.Message,
	)
	if err != nil {
		return fmt.Errorf("db.InsertLogcatEntry: %w", err)
	}
	return nil
}

func (d *DB) ListLogcatEntries(sessionID string, limit, offset int) ([]LogcatEntryRow, error) {
	rows, err := d.conn.Query(
		`SELECT id, session_id, timestamp, pid, tid, level, tag, message
		 FROM logcat_entries WHERE session_id = ? ORDER BY id ASC LIMIT ? OFFSET ?`,
		sessionID, limit, offset,
	)
	if err != nil {
		return nil, fmt.Errorf("db.ListLogcatEntries: %w", err)
	}
	defer rows.Close()

	var result []LogcatEntryRow
	for rows.Next() {
		var e LogcatEntryRow
		if err := rows.Scan(&e.ID, &e.SessionID, &e.Timestamp, &e.PID, &e.TID, &e.Level, &e.Tag, &e.Message); err != nil {
			return nil, err
		}
		result = append(result, e)
	}
	return result, rows.Err()
}

func (d *DB) CountLogcatEntries(sessionID string) (int, error) {
	var count int
	err := d.conn.QueryRow(`SELECT COUNT(*) FROM logcat_entries WHERE session_id = ?`, sessionID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("db.CountLogcatEntries: %w", err)
	}
	return count, nil
}

func (d *DB) SearchLogcatEntries(sessionID, tag, text, level string, limit int) ([]LogcatEntryRow, error) {
	query := `SELECT id, session_id, timestamp, pid, tid, level, tag, message
		 FROM logcat_entries WHERE session_id = ?`
	args := []any{sessionID}

	if tag != "" {
		query += ` AND tag LIKE ?`
		args = append(args, "%"+tag+"%")
	}
	if text != "" {
		query += ` AND message LIKE ?`
		args = append(args, "%"+text+"%")
	}
	if level != "" {
		query += ` AND level = ?`
		args = append(args, level)
	}

	if limit <= 0 {
		limit = 100
	}
	query += ` ORDER BY id ASC LIMIT ?`
	args = append(args, limit)

	rows, err := d.conn.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("db.SearchLogcatEntries: %w", err)
	}
	defer rows.Close()

	var result []LogcatEntryRow
	for rows.Next() {
		var e LogcatEntryRow
		if err := rows.Scan(&e.ID, &e.SessionID, &e.Timestamp, &e.PID, &e.TID, &e.Level, &e.Tag, &e.Message); err != nil {
			return nil, err
		}
		result = append(result, e)
	}
	return result, rows.Err()
}
