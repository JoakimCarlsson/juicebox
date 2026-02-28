package db

import (
	"database/sql"
	"fmt"
)

type ScriptFileRow struct {
	ID        string
	DeviceID  string
	Name      string
	Content   string
	CreatedAt int64
	UpdatedAt int64
}

type ScriptRunRow struct {
	ID           string
	SessionID    string
	ScriptFileID string
	Output       *string
	Status       string
	Timestamp    int64
}

func (d *DB) UpsertScriptFile(f ScriptFileRow) error {
	_, err := d.conn.Exec(
		`INSERT INTO script_files (id, device_id, name, content, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?)
		 ON CONFLICT(device_id, name) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
		f.ID,
		f.DeviceID,
		f.Name,
		f.Content,
		f.CreatedAt,
		f.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("db.UpsertScriptFile: %w", err)
	}
	return nil
}

func (d *DB) GetScriptFile(deviceID, name string) (*ScriptFileRow, error) {
	row := d.conn.QueryRow(
		`SELECT id, device_id, name, content, created_at, updated_at FROM script_files WHERE device_id = ? AND name = ?`,
		deviceID,
		name,
	)
	var f ScriptFileRow
	if err := row.Scan(&f.ID, &f.DeviceID, &f.Name, &f.Content, &f.CreatedAt, &f.UpdatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("db.GetScriptFile: %w", err)
	}
	return &f, nil
}

func (d *DB) GetScriptFileByID(id string) (*ScriptFileRow, error) {
	row := d.conn.QueryRow(
		`SELECT id, device_id, name, content, created_at, updated_at FROM script_files WHERE id = ?`,
		id,
	)
	var f ScriptFileRow
	if err := row.Scan(&f.ID, &f.DeviceID, &f.Name, &f.Content, &f.CreatedAt, &f.UpdatedAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("db.GetScriptFileByID: %w", err)
	}
	return &f, nil
}

func (d *DB) GetScriptFiles(deviceID string) ([]ScriptFileRow, error) {
	rows, err := d.conn.Query(
		`SELECT id, device_id, name, content, created_at, updated_at FROM script_files WHERE device_id = ? ORDER BY updated_at DESC`,
		deviceID,
	)
	if err != nil {
		return nil, fmt.Errorf("db.GetScriptFiles: %w", err)
	}
	defer rows.Close()

	var result []ScriptFileRow
	for rows.Next() {
		var f ScriptFileRow
		if err := rows.Scan(&f.ID, &f.DeviceID, &f.Name, &f.Content, &f.CreatedAt, &f.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, f)
	}
	return result, rows.Err()
}

func (d *DB) GetScriptFilesForApp(
	deviceID, bundleID string,
) ([]ScriptFileRow, error) {
	rows, err := d.conn.Query(
		`SELECT id, device_id, name, content, created_at, updated_at FROM script_files
		 WHERE device_id = ? AND (name LIKE ? || '/%' OR name NOT LIKE '%/%' OR name LIKE 'global/%')
		 ORDER BY updated_at DESC`,
		deviceID,
		bundleID,
	)
	if err != nil {
		return nil, fmt.Errorf("db.GetScriptFilesForApp: %w", err)
	}
	defer rows.Close()

	var result []ScriptFileRow
	for rows.Next() {
		var f ScriptFileRow
		if err := rows.Scan(&f.ID, &f.DeviceID, &f.Name, &f.Content, &f.CreatedAt, &f.UpdatedAt); err != nil {
			return nil, err
		}
		result = append(result, f)
	}
	return result, rows.Err()
}

func (d *DB) HasScriptFilesForApp(deviceID, bundleID string) (bool, error) {
	var count int
	err := d.conn.QueryRow(
		`SELECT COUNT(*) FROM script_files WHERE device_id = ? AND name LIKE ? || '/%'`,
		deviceID,
		bundleID,
	).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("db.HasScriptFilesForApp: %w", err)
	}
	return count > 0, nil
}

func (d *DB) DeleteScriptFile(id string) error {
	_, err := d.conn.Exec(`DELETE FROM script_files WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("db.DeleteScriptFile: %w", err)
	}
	return nil
}

func (d *DB) InsertScriptRun(r ScriptRunRow) error {
	_, err := d.conn.Exec(
		`INSERT INTO script_runs (id, session_id, script_file_id, output, status, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
		r.ID,
		r.SessionID,
		r.ScriptFileID,
		r.Output,
		r.Status,
		r.Timestamp,
	)
	if err != nil {
		return fmt.Errorf("db.InsertScriptRun: %w", err)
	}
	return nil
}

func (d *DB) UpdateScriptRun(id, output, status string) error {
	_, err := d.conn.Exec(
		`UPDATE script_runs SET output = ?, status = ? WHERE id = ?`,
		output, status, id,
	)
	if err != nil {
		return fmt.Errorf("db.UpdateScriptRun: %w", err)
	}
	return nil
}

func (d *DB) CompleteScriptRunByFile(
	sessionID, scriptFileID, output string,
) error {
	_, err := d.conn.Exec(
		`UPDATE script_runs SET output = ?, status = 'done' WHERE session_id = ? AND script_file_id = ? AND status = 'running'`,
		output,
		sessionID,
		scriptFileID,
	)
	if err != nil {
		return fmt.Errorf("db.CompleteScriptRunByFile: %w", err)
	}
	return nil
}

func (d *DB) GetScriptRuns(sessionID string) ([]ScriptRunRow, error) {
	rows, err := d.conn.Query(
		`SELECT id, session_id, script_file_id, output, status, timestamp FROM script_runs WHERE session_id = ? ORDER BY timestamp DESC`,
		sessionID,
	)
	if err != nil {
		return nil, fmt.Errorf("db.GetScriptRuns: %w", err)
	}
	defer rows.Close()

	var result []ScriptRunRow
	for rows.Next() {
		var r ScriptRunRow
		if err := rows.Scan(&r.ID, &r.SessionID, &r.ScriptFileID, &r.Output, &r.Status, &r.Timestamp); err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, rows.Err()
}
