package db

import (
	"database/sql"
	"fmt"
)

type JNIEventRow struct {
	ID          string
	SessionID   string
	ClassName   string
	MethodName  string
	Signature   string
	Arguments   *string
	ReturnValue *string
	Backtrace   *string
	Library     *string
	Timestamp   int64
}

func (d *DB) InsertJNIEvent(e *JNIEventRow) error {
	_, err := d.conn.Exec(
		`INSERT INTO jni_events (id, session_id, class_name, method_name, signature, arguments, return_value, backtrace, library, timestamp)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		e.ID, e.SessionID, e.ClassName, e.MethodName, e.Signature, e.Arguments, e.ReturnValue, e.Backtrace, e.Library, e.Timestamp,
	)
	if err != nil {
		return fmt.Errorf("db.InsertJNIEvent: %w", err)
	}
	return nil
}

func (d *DB) ListJNIEvents(sessionID string, limit, offset int) ([]JNIEventRow, error) {
	rows, err := d.conn.Query(
		`SELECT id, session_id, class_name, method_name, signature, arguments, return_value, backtrace, library, timestamp
		 FROM jni_events WHERE session_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
		sessionID, limit, offset,
	)
	if err != nil {
		return nil, fmt.Errorf("db.ListJNIEvents: %w", err)
	}
	defer rows.Close()
	return scanJNIEvents(rows)
}

func (d *DB) CountJNIEvents(sessionID string) (int, error) {
	var count int
	err := d.conn.QueryRow(`SELECT COUNT(*) FROM jni_events WHERE session_id = ?`, sessionID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("db.CountJNIEvents: %w", err)
	}
	return count, nil
}

func (d *DB) SearchJNIEvents(sessionID string, library, method string, limit int) ([]JNIEventRow, error) {
	query := `SELECT id, session_id, class_name, method_name, signature, arguments, return_value, backtrace, library, timestamp
		 FROM jni_events WHERE session_id = ?`
	args := []any{sessionID}

	if library != "" {
		query += ` AND library LIKE ?`
		args = append(args, "%"+library+"%")
	}

	if method != "" {
		query += ` AND (method_name LIKE ? OR class_name LIKE ?)`
		args = append(args, "%"+method+"%", "%"+method+"%")
	}

	if limit <= 0 {
		limit = 100
	}
	query += ` ORDER BY timestamp DESC LIMIT ?`
	args = append(args, limit)

	rows, err := d.conn.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("db.SearchJNIEvents: %w", err)
	}
	defer rows.Close()
	return scanJNIEvents(rows)
}

func scanJNIEvents(rows *sql.Rows) ([]JNIEventRow, error) {
	var result []JNIEventRow
	for rows.Next() {
		var e JNIEventRow
		if err := rows.Scan(
			&e.ID, &e.SessionID, &e.ClassName, &e.MethodName, &e.Signature,
			&e.Arguments, &e.ReturnValue, &e.Backtrace, &e.Library, &e.Timestamp,
		); err != nil {
			return nil, err
		}
		result = append(result, e)
	}
	return result, rows.Err()
}
