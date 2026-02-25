package db

import (
	"database/sql"
	"fmt"
)

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

func (d *DB) InsertHttpMessage(m *HttpMessageRow) error {
	_, err := d.conn.Exec(
		`INSERT INTO http_messages (id, session_id, method, url,
		 request_headers, request_body, request_body_encoding, request_body_size,
		 status_code, response_headers, response_body, response_body_encoding,
		 response_body_size, duration, timestamp)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		m.ID,
		m.SessionID,
		m.Method,
		m.URL,
		m.RequestHeaders,
		m.RequestBody,
		m.RequestBodyEncoding,
		m.RequestBodySize,
		m.StatusCode,
		m.ResponseHeaders,
		m.ResponseBody,
		m.ResponseBodyEncoding,
		m.ResponseBodySize,
		m.Duration,
		m.Timestamp,
	)
	if err != nil {
		return fmt.Errorf("db.InsertHttpMessage: %w", err)
	}
	return nil
}

func (d *DB) ListHttpMessages(
	sessionID string,
	limit, offset int,
) ([]HttpMessageRow, error) {
	rows, err := d.conn.Query(
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
	err := d.conn.QueryRow(`SELECT COUNT(*) FROM http_messages WHERE session_id = ?`, sessionID).
		Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("db.CountHttpMessages: %w", err)
	}
	return count, nil
}

func (d *DB) GetHttpMessage(id string) (*HttpMessageRow, error) {
	row := d.conn.QueryRow(
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

func (d *DB) SearchHttpMessages(
	sessionID, method, host string,
	statusCode *int,
	bodyContains string,
	limit int,
) ([]HttpMessageRow, error) {
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

	rows, err := d.conn.Query(query, args...)
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
