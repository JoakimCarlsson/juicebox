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
	Name      string
	Platform  string
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
		`INSERT INTO sessions (id, device_id, bundle_id, pid, name, platform, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		s.ID, s.DeviceID, s.BundleID, s.PID, s.Name, s.Platform, s.StartedAt,
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
		`SELECT id, device_id, bundle_id, pid, name, platform, started_at, ended_at FROM sessions WHERE id = ?`, id,
	)
	s := &SessionRow{}
	if err := row.Scan(&s.ID, &s.DeviceID, &s.BundleID, &s.PID, &s.Name, &s.Platform, &s.StartedAt, &s.EndedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("db.GetSession: %w", err)
	}
	return s, nil
}

func (d *DB) ListSessions(deviceID string, limit, offset int) ([]SessionRow, error) {
	rows, err := d.Conn.Query(
		`SELECT id, device_id, bundle_id, pid, name, platform, started_at, ended_at
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
		`SELECT id, device_id, bundle_id, pid, name, platform, started_at, ended_at
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
		if err := rows.Scan(&s.ID, &s.DeviceID, &s.BundleID, &s.PID, &s.Name, &s.Platform, &s.StartedAt, &s.EndedAt); err != nil {
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

func (d *DB) ListSessionsByBundle(deviceID, bundleID string, limit, offset int) ([]SessionRow, error) {
	rows, err := d.Conn.Query(
		`SELECT id, device_id, bundle_id, pid, name, platform, started_at, ended_at
		 FROM sessions WHERE device_id = ? AND bundle_id = ?
		 ORDER BY started_at DESC LIMIT ? OFFSET ?`,
		deviceID, bundleID, limit, offset,
	)
	if err != nil {
		return nil, fmt.Errorf("db.ListSessionsByBundle: %w", err)
	}
	defer rows.Close()
	return scanSessions(rows)
}

func (d *DB) CountSessionsByBundle(deviceID, bundleID string) (int, error) {
	var count int
	err := d.Conn.QueryRow(
		`SELECT COUNT(*) FROM sessions WHERE device_id = ? AND bundle_id = ?`,
		deviceID, bundleID,
	).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("db.CountSessionsByBundle: %w", err)
	}
	return count, nil
}

func (d *DB) ReopenSession(id string, pid int) error {
	_, err := d.Conn.Exec(`UPDATE sessions SET ended_at = NULL, pid = ? WHERE id = ?`, pid, id)
	if err != nil {
		return fmt.Errorf("db.ReopenSession: %w", err)
	}
	return nil
}

func (d *DB) RenameSession(id, name string) error {
	_, err := d.Conn.Exec(`UPDATE sessions SET name = ? WHERE id = ?`, name, id)
	if err != nil {
		return fmt.Errorf("db.RenameSession: %w", err)
	}
	return nil
}

func (d *DB) CloseOrphanedSessions(endedAt int64) (int64, error) {
	res, err := d.Conn.Exec(`UPDATE sessions SET ended_at = ? WHERE ended_at IS NULL`, endedAt)
	if err != nil {
		return 0, fmt.Errorf("db.CloseOrphanedSessions: %w", err)
	}
	return res.RowsAffected()
}

func (d *DB) GetHttpMessage(id string) (*HttpMessageRow, error) {
	row := d.Conn.QueryRow(
		`SELECT id, session_id, method, url,
		 request_headers, request_body, request_body_encoding, request_body_size,
		 status_code, response_headers, response_body, response_body_encoding,
		 response_body_size, duration, timestamp
		 FROM http_messages WHERE id = ?`, id,
	)
	var m HttpMessageRow
	if err := row.Scan(
		&m.ID, &m.SessionID, &m.Method, &m.URL,
		&m.RequestHeaders, &m.RequestBody, &m.RequestBodyEncoding, &m.RequestBodySize,
		&m.StatusCode, &m.ResponseHeaders, &m.ResponseBody, &m.ResponseBodyEncoding,
		&m.ResponseBodySize, &m.Duration, &m.Timestamp,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("db.GetHttpMessage: %w", err)
	}
	return &m, nil
}

func (d *DB) SearchHttpMessages(sessionID, method, host string, statusCode *int, bodyContains string, limit int) ([]HttpMessageRow, error) {
	query := `SELECT id, session_id, method, url,
		 request_headers, request_body, request_body_encoding, request_body_size,
		 status_code, response_headers, response_body, response_body_encoding,
		 response_body_size, duration, timestamp
		 FROM http_messages WHERE session_id = ?`
	args := []any{sessionID}

	if method != "" {
		query += ` AND method = ?`
		args = append(args, method)
	}
	if host != "" {
		query += ` AND url LIKE ?`
		args = append(args, "%"+host+"%")
	}
	if statusCode != nil {
		query += ` AND status_code = ?`
		args = append(args, *statusCode)
	}
	if bodyContains != "" {
		query += ` AND (request_body LIKE ? OR response_body LIKE ?)`
		args = append(args, "%"+bodyContains+"%", "%"+bodyContains+"%")
	}

	if limit <= 0 {
		limit = 50
	}
	query += ` ORDER BY timestamp ASC LIMIT ?`
	args = append(args, limit)

	rows, err := d.Conn.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("db.SearchHttpMessages: %w", err)
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
	_, err := d.Conn.Exec(
		`INSERT INTO crashes (id, session_id, crash_type, signal, address, registers, backtrace, java_stack_trace, exception_class, exception_message, timestamp)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		c.ID, c.SessionID, c.CrashType, c.Signal, c.Address, c.Registers, c.Backtrace, c.JavaStackTrace, c.ExceptionClass, c.ExceptionMessage, c.Timestamp,
	)
	if err != nil {
		return fmt.Errorf("db.InsertCrash: %w", err)
	}
	return nil
}

func (d *DB) ListCrashes(sessionID string, limit, offset int) ([]CrashRow, error) {
	rows, err := d.Conn.Query(
		`SELECT id, session_id, crash_type, signal, address, registers, backtrace, java_stack_trace, exception_class, exception_message, timestamp
		 FROM crashes WHERE session_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
		sessionID, limit, offset,
	)
	if err != nil {
		return nil, fmt.Errorf("db.ListCrashes: %w", err)
	}
	defer rows.Close()
	return scanCrashes(rows)
}

func (d *DB) CountCrashes(sessionID string) (int, error) {
	var count int
	err := d.Conn.QueryRow(`SELECT COUNT(*) FROM crashes WHERE session_id = ?`, sessionID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("db.CountCrashes: %w", err)
	}
	return count, nil
}

func (d *DB) SearchCrashes(sessionID string, sinceTimestamp int64, limit int) ([]CrashRow, error) {
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

	rows, err := d.Conn.Query(query, args...)
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
	_, err := d.Conn.Exec(
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
	rows, err := d.Conn.Query(
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
	err := d.Conn.QueryRow(`SELECT COUNT(*) FROM crypto_events WHERE session_id = ?`, sessionID).Scan(&count)
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

	rows, err := d.Conn.Query(query, args...)
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

	rows, err := d.Conn.Query(query, args...)
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

type ScriptRow struct {
	ID        string
	SessionID string
	Code      string
	Output    *string
	Status    string
	Timestamp int64
}

func (d *DB) InsertScript(s ScriptRow) error {
	_, err := d.Conn.Exec(
		`INSERT INTO scripts (id, session_id, code, output, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
		s.ID, s.SessionID, s.Code, s.Output, s.Status, s.Timestamp,
	)
	if err != nil {
		return fmt.Errorf("db.InsertScript: %w", err)
	}
	return nil
}

func (d *DB) UpdateScriptOutput(id, output, status string) error {
	_, err := d.Conn.Exec(
		`UPDATE scripts SET output = ?, status = ? WHERE id = ?`,
		output, status, id,
	)
	if err != nil {
		return fmt.Errorf("db.UpdateScriptOutput: %w", err)
	}
	return nil
}

func (d *DB) GetScripts(sessionID string) ([]ScriptRow, error) {
	rows, err := d.Conn.Query(
		`SELECT id, session_id, code, output, status, timestamp FROM scripts WHERE session_id = ? ORDER BY timestamp DESC`,
		sessionID,
	)
	if err != nil {
		return nil, fmt.Errorf("db.GetScripts: %w", err)
	}
	defer rows.Close()

	var result []ScriptRow
	for rows.Next() {
		var s ScriptRow
		if err := rows.Scan(&s.ID, &s.SessionID, &s.Code, &s.Output, &s.Status, &s.Timestamp); err != nil {
			return nil, err
		}
		result = append(result, s)
	}
	return result, rows.Err()
}
