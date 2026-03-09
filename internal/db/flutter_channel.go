package db

import (
	"database/sql"
	"fmt"
)

type FlutterChannelRow struct {
	ID        string
	SessionID string
	Channel   string
	Method    *string
	Direction string
	Arguments *string
	Result    *string
	Timestamp int64
}

func (d *DB) InsertFlutterChannel(r *FlutterChannelRow) error {
	_, err := d.conn.Exec(
		`INSERT INTO flutter_channel_events (id, session_id, channel, method, direction, arguments, result, timestamp)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		r.ID,
		r.SessionID,
		r.Channel,
		r.Method,
		r.Direction,
		r.Arguments,
		r.Result,
		r.Timestamp,
	)
	if err != nil {
		return fmt.Errorf("db.InsertFlutterChannel: %w", err)
	}
	return nil
}

func (d *DB) ListFlutterChannelsBySession(
	sessionID string,
	limit, offset int,
) ([]FlutterChannelRow, error) {
	rows, err := d.conn.Query(
		`SELECT id, session_id, channel, method, direction, arguments, result, timestamp
		 FROM flutter_channel_events WHERE session_id = ? ORDER BY timestamp ASC LIMIT ? OFFSET ?`,
		sessionID,
		limit,
		offset,
	)
	if err != nil {
		return nil, fmt.Errorf("db.ListFlutterChannelsBySession: %w", err)
	}
	defer rows.Close()
	return scanFlutterChannels(rows)
}

func (d *DB) SearchFlutterChannels(
	sessionID, channel string,
	limit int,
) ([]FlutterChannelRow, error) {
	query := `SELECT id, session_id, channel, method, direction, arguments, result, timestamp
		 FROM flutter_channel_events WHERE session_id = ?`
	args := []any{sessionID}

	if channel != "" {
		query += ` AND channel LIKE ?`
		args = append(args, "%"+channel+"%")
	}

	if limit <= 0 {
		limit = 50
	}
	query += ` ORDER BY timestamp DESC LIMIT ?`
	args = append(args, limit)

	rows, err := d.conn.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("db.SearchFlutterChannels: %w", err)
	}
	defer rows.Close()
	return scanFlutterChannels(rows)
}

func scanFlutterChannels(rows *sql.Rows) ([]FlutterChannelRow, error) {
	var result []FlutterChannelRow
	for rows.Next() {
		var r FlutterChannelRow
		if err := rows.Scan(
			&r.ID, &r.SessionID, &r.Channel, &r.Method,
			&r.Direction, &r.Arguments, &r.Result, &r.Timestamp,
		); err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, rows.Err()
}
