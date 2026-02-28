package db

import (
	"context"
	"database/sql"
)

func (d *DB) GetSetting(ctx context.Context, key string) (string, error) {
	var value string
	err := d.conn.QueryRowContext(ctx, "SELECT value FROM settings WHERE key = ?", key).
		Scan(&value)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return value, err
}

func (d *DB) SetSetting(ctx context.Context, key, value string) error {
	_, err := d.conn.ExecContext(
		ctx,
		"INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
		key,
		value,
	)
	return err
}

func (d *DB) GetSettings(
	ctx context.Context,
	keys []string,
) (map[string]string, error) {
	result := make(map[string]string, len(keys))
	for _, k := range keys {
		v, err := d.GetSetting(ctx, k)
		if err != nil {
			return nil, err
		}
		if v != "" {
			result[k] = v
		}
	}
	return result, nil
}

func (d *DB) DeleteSetting(ctx context.Context, key string) error {
	_, err := d.conn.ExecContext(ctx, "DELETE FROM settings WHERE key = ?", key)
	return err
}
