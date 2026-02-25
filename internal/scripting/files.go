package scripting

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/joakimcarlsson/juicebox/internal/db"
	"github.com/joakimcarlsson/juicebox/internal/devicehub"
)

type FileManager struct {
	db  *db.DB
	hub *devicehub.Hub
}

func NewFileManager(database *db.DB, hub *devicehub.Hub) *FileManager {
	return &FileManager{db: database, hub: hub}
}

type ScriptFile struct {
	ID        string
	SessionID string
	Name      string
	Content   string
	CreatedAt int64
	UpdatedAt int64
}

func (fm *FileManager) Upsert(sessionID, name, content string) (*ScriptFile, error) {
	now := time.Now().UnixMilli()
	fileID := fmt.Sprintf("sf_%d", time.Now().UnixNano())

	if err := fm.db.UpsertScriptFile(db.ScriptFileRow{
		ID:        fileID,
		SessionID: sessionID,
		Name:      name,
		Content:   content,
		CreatedAt: now,
		UpdatedAt: now,
	}); err != nil {
		return nil, fmt.Errorf("scripting.Upsert: %w", err)
	}

	f, err := fm.db.GetScriptFile(sessionID, name)
	if err != nil || f == nil {
		return nil, fmt.Errorf("scripting.Upsert: failed to read back script file")
	}

	fm.broadcastFileWrite(sessionID, name)

	return rowToFile(f), nil
}

func (fm *FileManager) Get(sessionID, name string) (*ScriptFile, error) {
	f, err := fm.db.GetScriptFile(sessionID, name)
	if err != nil {
		return nil, fmt.Errorf("scripting.Get: %w", err)
	}
	if f == nil {
		return nil, nil
	}
	return rowToFile(f), nil
}

func (fm *FileManager) GetByID(id string) (*ScriptFile, error) {
	f, err := fm.db.GetScriptFileByID(id)
	if err != nil {
		return nil, fmt.Errorf("scripting.GetByID: %w", err)
	}
	if f == nil {
		return nil, nil
	}
	return rowToFile(f), nil
}

func (fm *FileManager) List(sessionID string) ([]ScriptFile, error) {
	rows, err := fm.db.GetScriptFiles(sessionID)
	if err != nil {
		return nil, fmt.Errorf("scripting.List: %w", err)
	}

	files := make([]ScriptFile, 0, len(rows))
	for _, r := range rows {
		files = append(files, *rowToFile(&r))
	}
	return files, nil
}

func (fm *FileManager) Delete(id string) error {
	return fm.db.DeleteScriptFile(id)
}

func (fm *FileManager) broadcastFileWrite(sessionID, name string) {
	if fm.hub == nil {
		return
	}
	payload, _ := json.Marshal(map[string]string{"name": name})
	if data, err := devicehub.Marshal("file_write", sessionID, json.RawMessage(payload)); err == nil {
		fm.hub.Broadcast(data)
	}
}

func rowToFile(r *db.ScriptFileRow) *ScriptFile {
	return &ScriptFile{
		ID:        r.ID,
		SessionID: r.SessionID,
		Name:      r.Name,
		Content:   r.Content,
		CreatedAt: r.CreatedAt,
		UpdatedAt: r.UpdatedAt,
	}
}
