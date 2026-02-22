package db

import (
	"database/sql"
	"fmt"
)

type SessionRow struct {
	ID        string
	DeviceID  string
	BundleID  string
	PID       int
	StartedAt int64
	EndedAt   *int64
}

type HttpMessageRow struct {
	ID                   string
	SessionID            string
	Method               string
	URL                  string
	RequestHeaders       string
	RequestBody          *string
	RequestBodyEncoding  string
	RequestBodySize      int
	StatusCode           int
	ResponseHeaders      string
	ResponseBody         *string
	ResponseBodyEncoding string
	ResponseBodySize     int
	Duration             int64
	Timestamp            int64
}

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

func (d *DB) InsertSession(s *SessionRow) error {
	_, err := d.Conn.Exec(
		`INSERT INTO sessions (id, device_id, bundle_id, pid, started_at) VALUES (?, ?, ?, ?, ?)`,
		s.ID, s.DeviceID, s.BundleID, s.PID, s.StartedAt,
	)
	if err != nil {
		return fmt.Errorf("db.InsertSession: %w", err)
	}
	return nil
}

func (d *DB) EndSession(id string, endedAt int64) error {
	_, err := d.Conn.Exec(`UPDATE sessions SET ended_at = ? WHERE id = ?`, endedAt, id)
	if err != nil {
		return fmt.Errorf("db.EndSession: %w", err)
	}
	return nil
}

func (d *DB) GetSession(id string) (*SessionRow, error) {
	row := d.Conn.QueryRow(
		`SELECT id, device_id, bundle_id, pid, started_at, ended_at FROM sessions WHERE id = ?`, id,
	)
	s := &SessionRow{}
	if err := row.Scan(&s.ID, &s.DeviceID, &s.BundleID, &s.PID, &s.StartedAt, &s.EndedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("db.GetSession: %w", err)
	}
	return s, nil
}

func (d *DB) ListSessions(deviceID string, limit, offset int) ([]SessionRow, error) {
	rows, err := d.Conn.Query(
		`SELECT id, device_id, bundle_id, pid, started_at, ended_at
		 FROM sessions WHERE device_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?`,
		deviceID, limit, offset,
	)
	if err != nil {
		return nil, fmt.Errorf("db.ListSessions: %w", err)
	}
	defer rows.Close()
	return scanSessions(rows)
}

func (d *DB) ListAllSessions(limit, offset int) ([]SessionRow, error) {
	rows, err := d.Conn.Query(
		`SELECT id, device_id, bundle_id, pid, started_at, ended_at
		 FROM sessions ORDER BY started_at DESC LIMIT ? OFFSET ?`,
		limit, offset,
	)
	if err != nil {
		return nil, fmt.Errorf("db.ListAllSessions: %w", err)
	}
	defer rows.Close()
	return scanSessions(rows)
}

func (d *DB) CountSessions(deviceID string) (int, error) {
	var count int
	err := d.Conn.QueryRow(`SELECT COUNT(*) FROM sessions WHERE device_id = ?`, deviceID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("db.CountSessions: %w", err)
	}
	return count, nil
}

func scanSessions(rows *sql.Rows) ([]SessionRow, error) {
	var result []SessionRow
	for rows.Next() {
		var s SessionRow
		if err := rows.Scan(&s.ID, &s.DeviceID, &s.BundleID, &s.PID, &s.StartedAt, &s.EndedAt); err != nil {
			return nil, err
		}
		result = append(result, s)
	}
	return result, rows.Err()
}

func (d *DB) InsertHttpMessage(m *HttpMessageRow) error {
	_, err := d.Conn.Exec(
		`INSERT INTO http_messages (id, session_id, method, url,
		 request_headers, request_body, request_body_encoding, request_body_size,
		 status_code, response_headers, response_body, response_body_encoding,
		 response_body_size, duration, timestamp)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		m.ID, m.SessionID, m.Method, m.URL,
		m.RequestHeaders, m.RequestBody, m.RequestBodyEncoding, m.RequestBodySize,
		m.StatusCode, m.ResponseHeaders, m.ResponseBody, m.ResponseBodyEncoding,
		m.ResponseBodySize, m.Duration, m.Timestamp,
	)
	if err != nil {
		return fmt.Errorf("db.InsertHttpMessage: %w", err)
	}
	return nil
}

func (d *DB) ListHttpMessages(sessionID string, limit, offset int) ([]HttpMessageRow, error) {
	rows, err := d.Conn.Query(
		`SELECT id, session_id, method, url,
		 request_headers, request_body, request_body_encoding, request_body_size,
		 status_code, response_headers, response_body, response_body_encoding,
		 response_body_size, duration, timestamp
		 FROM http_messages WHERE session_id = ? ORDER BY timestamp ASC LIMIT ? OFFSET ?`,
		sessionID, limit, offset,
	)
	if err != nil {
		return nil, fmt.Errorf("db.ListHttpMessages: %w", err)
	}
	defer rows.Close()

	var result []HttpMessageRow
	for rows.Next() {
		var m HttpMessageRow
		if err := rows.Scan(
			&m.ID, &m.SessionID, &m.Method, &m.URL,
			&m.RequestHeaders, &m.RequestBody, &m.RequestBodyEncoding, &m.RequestBodySize,
			&m.StatusCode, &m.ResponseHeaders, &m.ResponseBody, &m.ResponseBodyEncoding,
			&m.ResponseBodySize, &m.Duration, &m.Timestamp,
		); err != nil {
			return nil, err
		}
		result = append(result, m)
	}
	return result, rows.Err()
}

func (d *DB) CountHttpMessages(sessionID string) (int, error) {
	var count int
	err := d.Conn.QueryRow(`SELECT COUNT(*) FROM http_messages WHERE session_id = ?`, sessionID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("db.CountHttpMessages: %w", err)
	}
	return count, nil
}

func (d *DB) InsertLogcatEntry(e *LogcatEntryRow) error {
	_, err := d.Conn.Exec(
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
	rows, err := d.Conn.Query(
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
	err := d.Conn.QueryRow(`SELECT COUNT(*) FROM logcat_entries WHERE session_id = ?`, sessionID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("db.CountLogcatEntries: %w", err)
	}
	return count, nil
}

func (d *DB) CloseOrphanedSessions(endedAt int64) (int64, error) {
	res, err := d.Conn.Exec(`UPDATE sessions SET ended_at = ? WHERE ended_at IS NULL`, endedAt)
	if err != nil {
		return 0, fmt.Errorf("db.CloseOrphanedSessions: %w", err)
	}
	return res.RowsAffected()
}
