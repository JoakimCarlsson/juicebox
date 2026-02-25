package db

import (
	"database/sql"
	"fmt"
)

type SessionRow struct {
	ID           string
	DeviceID     string
	BundleID     string
	PID          int
	Name         string
	Platform     string
	Capabilities string
	StartedAt    int64
	EndedAt      *int64
}

func (d *DB) InsertSession(s *SessionRow) error {
	_, err := d.conn.Exec(
		`INSERT INTO sessions (id, device_id, bundle_id, pid, name, platform, capabilities, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		s.ID,
		s.DeviceID,
		s.BundleID,
		s.PID,
		s.Name,
		s.Platform,
		s.Capabilities,
		s.StartedAt,
	)
	if err != nil {
		return fmt.Errorf("db.InsertSession: %w", err)
	}
	return nil
}

func (d *DB) EndSession(id string, endedAt int64) error {
	_, err := d.conn.Exec(
		`UPDATE sessions SET ended_at = ? WHERE id = ?`,
		endedAt,
		id,
	)
	if err != nil {
		return fmt.Errorf("db.EndSession: %w", err)
	}
	return nil
}

func (d *DB) GetSession(id string) (*SessionRow, error) {
	row := d.conn.QueryRow(
		`SELECT id, device_id, bundle_id, pid, name, platform, capabilities, started_at, ended_at FROM sessions WHERE id = ?`,
		id,
	)
	s := &SessionRow{}
	if err := row.Scan(&s.ID, &s.DeviceID, &s.BundleID, &s.PID, &s.Name, &s.Platform, &s.Capabilities, &s.StartedAt, &s.EndedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("db.GetSession: %w", err)
	}
	return s, nil
}

func (d *DB) ListSessions(
	deviceID string,
	limit, offset int,
) ([]SessionRow, error) {
	rows, err := d.conn.Query(
		`SELECT id, device_id, bundle_id, pid, name, platform, capabilities, started_at, ended_at
		 FROM sessions WHERE device_id = ? ORDER BY started_at DESC LIMIT ? OFFSET ?`,
		deviceID,
		limit,
		offset,
	)
	if err != nil {
		return nil, fmt.Errorf("db.ListSessions: %w", err)
	}
	defer rows.Close()
	return scanSessions(rows)
}

func (d *DB) ListAllSessions(limit, offset int) ([]SessionRow, error) {
	rows, err := d.conn.Query(
		`SELECT id, device_id, bundle_id, pid, name, platform, capabilities, started_at, ended_at
		 FROM sessions ORDER BY started_at DESC LIMIT ? OFFSET ?`,
		limit,
		offset,
	)
	if err != nil {
		return nil, fmt.Errorf("db.ListAllSessions: %w", err)
	}
	defer rows.Close()
	return scanSessions(rows)
}

func (d *DB) CountSessions(deviceID string) (int, error) {
	var count int
	err := d.conn.QueryRow(`SELECT COUNT(*) FROM sessions WHERE device_id = ?`, deviceID).
		Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("db.CountSessions: %w", err)
	}
	return count, nil
}

func (d *DB) ListSessionsByBundle(
	deviceID, bundleID string,
	limit, offset int,
) ([]SessionRow, error) {
	rows, err := d.conn.Query(
		`SELECT id, device_id, bundle_id, pid, name, platform, capabilities, started_at, ended_at
		 FROM sessions WHERE device_id = ? AND bundle_id = ?
		 ORDER BY started_at DESC LIMIT ? OFFSET ?`,
		deviceID,
		bundleID,
		limit,
		offset,
	)
	if err != nil {
		return nil, fmt.Errorf("db.ListSessionsByBundle: %w", err)
	}
	defer rows.Close()
	return scanSessions(rows)
}

func (d *DB) CountSessionsByBundle(deviceID, bundleID string) (int, error) {
	var count int
	err := d.conn.QueryRow(
		`SELECT COUNT(*) FROM sessions WHERE device_id = ? AND bundle_id = ?`,
		deviceID, bundleID,
	).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("db.CountSessionsByBundle: %w", err)
	}
	return count, nil
}

func (d *DB) ReopenSession(id string, pid int) error {
	_, err := d.conn.Exec(
		`UPDATE sessions SET ended_at = NULL, pid = ? WHERE id = ?`,
		pid,
		id,
	)
	if err != nil {
		return fmt.Errorf("db.ReopenSession: %w", err)
	}
	return nil
}

func (d *DB) RenameSession(id, name string) error {
	_, err := d.conn.Exec(`UPDATE sessions SET name = ? WHERE id = ?`, name, id)
	if err != nil {
		return fmt.Errorf("db.RenameSession: %w", err)
	}
	return nil
}

func (d *DB) CloseOrphanedSessions(endedAt int64) (int64, error) {
	res, err := d.conn.Exec(
		`UPDATE sessions SET ended_at = ? WHERE ended_at IS NULL`,
		endedAt,
	)
	if err != nil {
		return 0, fmt.Errorf("db.CloseOrphanedSessions: %w", err)
	}
	return res.RowsAffected()
}

func scanSessions(rows *sql.Rows) ([]SessionRow, error) {
	var result []SessionRow
	for rows.Next() {
		var s SessionRow
		if err := rows.Scan(&s.ID, &s.DeviceID, &s.BundleID, &s.PID, &s.Name, &s.Platform, &s.Capabilities, &s.StartedAt, &s.EndedAt); err != nil {
			return nil, err
		}
		result = append(result, s)
	}
	return result, rows.Err()
}
