package db

import (
	"database/sql"
	"fmt"
)

type ClipboardEventRow struct {
	ID          string
	SessionID   string
	Direction   string
	Content     *string
	MimeType    *string
	CallerStack *string
	Timestamp   int64
}

func (d *DB) InsertClipboardEvent(c *ClipboardEventRow) error {
	_, err := d.conn.Exec(
		`INSERT INTO clipboard_events (id, session_id, direction, content, mime_type, caller_stack, timestamp)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		c.ID,
		c.SessionID,
		c.Direction,
		c.Content,
		c.MimeType,
		c.CallerStack,
		c.Timestamp,
	)
	if err != nil {
		return fmt.Errorf("db.InsertClipboardEvent: %w", err)
	}
	return nil
}

func (d *DB) ListClipboardEvents(
	sessionID string,
	limit, offset int,
) ([]ClipboardEventRow, error) {
	rows, err := d.conn.Query(
		`SELECT id, session_id, direction, content, mime_type, caller_stack, timestamp
		 FROM clipboard_events WHERE session_id = ? ORDER BY timestamp ASC LIMIT ? OFFSET ?`,
		sessionID,
		limit,
		offset,
	)
	if err != nil {
		return nil, fmt.Errorf("db.ListClipboardEvents: %w", err)
	}
	defer rows.Close()
	return scanClipboardEvents(rows)
}

func (d *DB) CountClipboardEvents(sessionID string) (int, error) {
	var count int
	err := d.conn.QueryRow(`SELECT COUNT(*) FROM clipboard_events WHERE session_id = ?`, sessionID).
		Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("db.CountClipboardEvents: %w", err)
	}
	return count, nil
}

func (d *DB) SearchClipboardEvents(
	sessionID, direction, contentQuery string,
	limit int,
) ([]ClipboardEventRow, error) {
	query := `SELECT id, session_id, direction, content, mime_type, caller_stack, timestamp
		 FROM clipboard_events WHERE session_id = ?`
	args := []any{sessionID}

	if direction != "" {
		query += ` AND direction = ?`
		args = append(args, direction)
	}
	if contentQuery != "" {
		query += ` AND content LIKE ?`
		args = append(args, "%"+contentQuery+"%")
	}

	if limit <= 0 {
		limit = 50
	}
	query += ` ORDER BY timestamp DESC LIMIT ?`
	args = append(args, limit)

	rows, err := d.conn.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("db.SearchClipboardEvents: %w", err)
	}
	defer rows.Close()
	return scanClipboardEvents(rows)
}

func scanClipboardEvents(rows *sql.Rows) ([]ClipboardEventRow, error) {
	var result []ClipboardEventRow
	for rows.Next() {
		var c ClipboardEventRow
		if err := rows.Scan(
			&c.ID, &c.SessionID, &c.Direction, &c.Content,
			&c.MimeType, &c.CallerStack, &c.Timestamp,
		); err != nil {
			return nil, err
		}
		result = append(result, c)
	}
	return result, rows.Err()
}
