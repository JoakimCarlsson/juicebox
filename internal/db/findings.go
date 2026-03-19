package db

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

type FindingRow struct {
	ID          string `json:"id"`
	SessionID   string `json:"sessionId"`
	Title       string `json:"title"`
	Severity    string `json:"severity"`
	Description string `json:"description"`
	CreatedAt   int64  `json:"createdAt"`
	UpdatedAt   int64  `json:"updatedAt"`
}

const findingCols = `id, session_id, title, severity, description, created_at, updated_at`

const severityOrder = `CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END`

func scanFinding(s interface{ Scan(...any) error }) (*FindingRow, error) {
	var f FindingRow
	if err := s.Scan(&f.ID, &f.SessionID, &f.Title, &f.Severity, &f.Description, &f.CreatedAt, &f.UpdatedAt); err != nil {
		return nil, err
	}
	return &f, nil
}

func scanFindingRows(rows *sql.Rows) ([]FindingRow, error) {
	var result []FindingRow
	for rows.Next() {
		f, err := scanFinding(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, *f)
	}
	if result == nil {
		result = []FindingRow{}
	}
	return result, rows.Err()
}

func (d *DB) CreateFinding(ctx context.Context, f *FindingRow) error {
	_, err := d.conn.ExecContext(
		ctx,
		`INSERT INTO findings (`+findingCols+`) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		f.ID,
		f.SessionID,
		f.Title,
		f.Severity,
		f.Description,
		f.CreatedAt,
		f.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("db.CreateFinding: %w", err)
	}
	return nil
}

func (d *DB) GetFinding(ctx context.Context, id string) (*FindingRow, error) {
	f, err := scanFinding(d.conn.QueryRowContext(
		ctx, `SELECT `+findingCols+` FROM findings WHERE id = ?`, id,
	))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("db.GetFinding: %w", err)
	}
	return f, nil
}

func (d *DB) ListFindings(
	ctx context.Context,
	sessionID string,
) ([]FindingRow, error) {
	rows, err := d.conn.QueryContext(
		ctx,
		`SELECT `+findingCols+` FROM findings WHERE session_id = ? ORDER BY `+severityOrder+`, created_at DESC`,
		sessionID,
	)
	if err != nil {
		return nil, fmt.Errorf("db.ListFindings: %w", err)
	}
	defer rows.Close()
	return scanFindingRows(rows)
}

func (d *DB) ListFindingsByDevice(
	ctx context.Context,
	deviceID string,
) ([]FindingRow, error) {
	rows, err := d.conn.QueryContext(
		ctx,
		`SELECT f.id, f.session_id, f.title, f.severity, f.description, f.created_at, f.updated_at
		 FROM findings f JOIN sessions s ON f.session_id = s.id
		 WHERE s.device_id = ?
		 ORDER BY `+severityOrder+`, f.created_at DESC`,
		deviceID,
	)
	if err != nil {
		return nil, fmt.Errorf("db.ListFindingsByDevice: %w", err)
	}
	defer rows.Close()
	return scanFindingRows(rows)
}

func (d *DB) UpdateFinding(
	ctx context.Context,
	id string,
	title, severity, description *string,
) error {
	now := time.Now().UnixMilli()
	if title != nil && severity != nil && description != nil {
		_, err := d.conn.ExecContext(
			ctx,
			"UPDATE findings SET title = ?, severity = ?, description = ?, updated_at = ? WHERE id = ?",
			*title,
			*severity,
			*description,
			now,
			id,
		)
		return err
	}
	if title != nil {
		_, err := d.conn.ExecContext(
			ctx,
			"UPDATE findings SET title = ?, updated_at = ? WHERE id = ?",
			*title,
			now,
			id,
		)
		return err
	}
	if severity != nil {
		_, err := d.conn.ExecContext(
			ctx,
			"UPDATE findings SET severity = ?, updated_at = ? WHERE id = ?",
			*severity,
			now,
			id,
		)
		return err
	}
	if description != nil {
		_, err := d.conn.ExecContext(
			ctx,
			"UPDATE findings SET description = ?, updated_at = ? WHERE id = ?",
			*description,
			now,
			id,
		)
		return err
	}
	return nil
}

func (d *DB) DeleteFinding(ctx context.Context, id string) error {
	_, err := d.conn.ExecContext(ctx, "DELETE FROM findings WHERE id = ?", id)
	return err
}

func (d *DB) ClearFindingsByDevice(ctx context.Context, deviceID string) error {
	_, err := d.conn.ExecContext(
		ctx,
		`DELETE FROM findings WHERE session_id IN (SELECT id FROM sessions WHERE device_id = ?)`,
		deviceID,
	)
	return err
}
