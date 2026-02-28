package db

import (
	"context"
	"database/sql"
	"time"
)

type Conversation struct {
	ID        string `json:"id"`
	DeviceID  string `json:"device_id"`
	Title     string `json:"title"`
	Model     string `json:"model"`
	CreatedAt int64  `json:"created_at"`
	UpdatedAt int64  `json:"updated_at"`
}

func (d *DB) ListConversations(
	ctx context.Context,
	deviceID string,
) ([]Conversation, error) {
	rows, err := d.conn.QueryContext(
		ctx,
		"SELECT id, device_id, title, model, created_at, updated_at FROM chat_conversations WHERE device_id = ? ORDER BY updated_at DESC",
		deviceID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var convos []Conversation
	for rows.Next() {
		var c Conversation
		if err := rows.Scan(&c.ID, &c.DeviceID, &c.Title, &c.Model, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		convos = append(convos, c)
	}
	if convos == nil {
		convos = []Conversation{}
	}
	return convos, rows.Err()
}

func (d *DB) CreateConversation(
	ctx context.Context,
	id, deviceID, title, modelID string,
) (*Conversation, error) {
	now := time.Now().UnixMilli()
	_, err := d.conn.ExecContext(
		ctx,
		"INSERT INTO chat_conversations (id, device_id, title, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
		id,
		deviceID,
		title,
		modelID,
		now,
		now,
	)
	if err != nil {
		return nil, err
	}
	return &Conversation{
		ID:        id,
		DeviceID:  deviceID,
		Title:     title,
		Model:     modelID,
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

func (d *DB) GetConversation(
	ctx context.Context,
	id string,
) (*Conversation, error) {
	var c Conversation
	err := d.conn.QueryRowContext(
		ctx,
		"SELECT id, device_id, title, model, created_at, updated_at FROM chat_conversations WHERE id = ?",
		id,
	).Scan(&c.ID, &c.DeviceID, &c.Title, &c.Model, &c.CreatedAt, &c.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (d *DB) UpdateConversation(
	ctx context.Context,
	id string,
	title *string,
	modelID *string,
) error {
	now := time.Now().UnixMilli()
	if title != nil && modelID != nil {
		_, err := d.conn.ExecContext(
			ctx,
			"UPDATE chat_conversations SET title = ?, model = ?, updated_at = ? WHERE id = ?",
			*title,
			*modelID,
			now,
			id,
		)
		return err
	}
	if title != nil {
		_, err := d.conn.ExecContext(
			ctx,
			"UPDATE chat_conversations SET title = ?, updated_at = ? WHERE id = ?",
			*title,
			now,
			id,
		)
		return err
	}
	if modelID != nil {
		_, err := d.conn.ExecContext(
			ctx,
			"UPDATE chat_conversations SET model = ?, updated_at = ? WHERE id = ?",
			*modelID,
			now,
			id,
		)
		return err
	}
	return nil
}

func (d *DB) DeleteConversation(ctx context.Context, id string) error {
	_, err := d.conn.ExecContext(
		ctx,
		"DELETE FROM chat_conversations WHERE id = ?",
		id,
	)
	return err
}

func (d *DB) TouchConversation(ctx context.Context, id string) error {
	now := time.Now().UnixMilli()
	_, err := d.conn.ExecContext(
		ctx,
		"UPDATE chat_conversations SET updated_at = ? WHERE id = ?",
		now,
		id,
	)
	return err
}
