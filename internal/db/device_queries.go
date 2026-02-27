package db

import (
	"fmt"
)

func (d *DB) ClearHttpMessagesByDevice(deviceID string) error {
	_, err := d.conn.Exec(
		`DELETE FROM http_messages WHERE session_id IN (SELECT id FROM sessions WHERE device_id = ?)`,
		deviceID,
	)
	return err
}

func (d *DB) ClearLogsByDevice(deviceID string) error {
	_, err := d.conn.Exec(
		`DELETE FROM logcat_entries WHERE session_id IN (SELECT id FROM sessions WHERE device_id = ?)`,
		deviceID,
	)
	return err
}

func (d *DB) ClearCrashesByDevice(deviceID string) error {
	_, err := d.conn.Exec(
		`DELETE FROM crashes WHERE session_id IN (SELECT id FROM sessions WHERE device_id = ?)`,
		deviceID,
	)
	return err
}

func (d *DB) ClearCryptoByDevice(deviceID string) error {
	_, err := d.conn.Exec(
		`DELETE FROM crypto_events WHERE session_id IN (SELECT id FROM sessions WHERE device_id = ?)`,
		deviceID,
	)
	return err
}

func (d *DB) ClearClipboardByDevice(deviceID string) error {
	_, err := d.conn.Exec(
		`DELETE FROM clipboard_events WHERE session_id IN (SELECT id FROM sessions WHERE device_id = ?)`,
		deviceID,
	)
	return err
}

func (d *DB) ListHttpMessagesByDevice(
	deviceID string,
	limit, offset int,
) ([]HttpMessageRow, error) {
	rows, err := d.conn.Query(
		`SELECT m.id, m.session_id, m.method, m.url,
		 m.request_headers, m.request_body, m.request_body_encoding, m.request_body_size,
		 m.status_code, m.response_headers, m.response_body, m.response_body_encoding,
		 m.response_body_size, m.duration, m.timestamp
		 FROM http_messages m
		 JOIN sessions s ON m.session_id = s.id
		 WHERE s.device_id = ?
		 ORDER BY m.timestamp ASC LIMIT ? OFFSET ?`,
		deviceID, limit, offset,
	)
	if err != nil {
		return nil, fmt.Errorf("db.ListHttpMessagesByDevice: %w", err)
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

func (d *DB) ListLogsByDevice(
	deviceID string,
	limit, offset int,
) ([]LogcatEntryRow, error) {
	rows, err := d.conn.Query(
		`SELECT l.id, l.session_id, l.timestamp, l.pid, l.tid, l.level, l.tag, l.message
		 FROM logcat_entries l
		 JOIN sessions s ON l.session_id = s.id
		 WHERE s.device_id = ?
		 ORDER BY l.rowid ASC LIMIT ? OFFSET ?`,
		deviceID,
		limit,
		offset,
	)
	if err != nil {
		return nil, fmt.Errorf("db.ListLogsByDevice: %w", err)
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

func (d *DB) ListCrashesByDevice(
	deviceID string,
	limit, offset int,
) ([]CrashRow, error) {
	rows, err := d.conn.Query(
		`SELECT c.id, c.session_id, c.crash_type, c.signal, c.address, c.registers, c.backtrace,
		 c.java_stack_trace, c.exception_class, c.exception_message, c.timestamp
		 FROM crashes c
		 JOIN sessions s ON c.session_id = s.id
		 WHERE s.device_id = ?
		 ORDER BY c.timestamp DESC LIMIT ? OFFSET ?`,
		deviceID,
		limit,
		offset,
	)
	if err != nil {
		return nil, fmt.Errorf("db.ListCrashesByDevice: %w", err)
	}
	defer rows.Close()
	return scanCrashes(rows)
}

func (d *DB) ListCryptoEventsByDevice(
	deviceID string,
	limit, offset int,
) ([]CryptoEventRow, error) {
	rows, err := d.conn.Query(
		`SELECT ce.id, ce.session_id, ce.operation, ce.algorithm, ce.input, ce.output, ce.key, ce.iv, ce.timestamp
		 FROM crypto_events ce
		 JOIN sessions s ON ce.session_id = s.id
		 WHERE s.device_id = ?
		 ORDER BY ce.timestamp ASC LIMIT ? OFFSET ?`,
		deviceID,
		limit,
		offset,
	)
	if err != nil {
		return nil, fmt.Errorf("db.ListCryptoEventsByDevice: %w", err)
	}
	defer rows.Close()
	return scanCryptoEvents(rows)
}

func (d *DB) ListClipboardEventsByDevice(
	deviceID string,
	limit, offset int,
) ([]ClipboardEventRow, error) {
	rows, err := d.conn.Query(
		`SELECT cb.id, cb.session_id, cb.direction, cb.content, cb.mime_type, cb.caller_stack, cb.timestamp
		 FROM clipboard_events cb
		 JOIN sessions s ON cb.session_id = s.id
		 WHERE s.device_id = ?
		 ORDER BY cb.timestamp ASC LIMIT ? OFFSET ?`,
		deviceID,
		limit,
		offset,
	)
	if err != nil {
		return nil, fmt.Errorf("db.ListClipboardEventsByDevice: %w", err)
	}
	defer rows.Close()
	return scanClipboardEvents(rows)
}
