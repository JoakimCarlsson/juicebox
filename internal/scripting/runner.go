package scripting

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/joakimcarlsson/juicebox/internal/bridge"
	"github.com/joakimcarlsson/juicebox/internal/db"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type Runner struct {
	db      *db.DB
	manager *session.Manager
}

func NewRunner(database *db.DB, manager *session.Manager) *Runner {
	return &Runner{db: database, manager: manager}
}

type RunResult struct {
	ID        string
	FileID    string
	FileName  string
	Mode      string
	Status    string
	Messages  []json.RawMessage
	Error     string
	Timestamp int64
}

func (r *Runner) Run(
	sessionID, name string,
	initialWaitSecs int,
) (*RunResult, error) {
	file, err := r.db.GetScriptFile(sessionID, name)
	if err != nil || file == nil {
		return nil, fmt.Errorf("script file %q not found", name)
	}

	liveSess := r.manager.GetSession(sessionID)
	if liveSess == nil {
		return nil, fmt.Errorf("active session not found")
	}

	runID := fmt.Sprintf("sr_%d", time.Now().UnixNano())
	now := time.Now().UnixMilli()

	_ = r.db.InsertScriptRun(db.ScriptRunRow{
		ID:           runID,
		SessionID:    sessionID,
		ScriptFileID: file.ID,
		Status:       "running",
		Timestamp:    now,
	})

	resp, err := r.manager.RunScript(
		sessionID,
		file.Content,
		name,
		initialWaitSecs,
	)
	if err != nil {
		_ = r.db.UpdateScriptRun(runID, "", "error")
		return &RunResult{
			ID:        runID,
			FileID:    file.ID,
			FileName:  file.Name,
			Status:    "error",
			Error:     err.Error(),
			Timestamp: now,
		}, nil
	}

	if resp.Mode == "oneshot" {
		outputJSON, _ := json.Marshal(resp.Messages)
		_ = r.db.UpdateScriptRun(runID, string(outputJSON), "done")
		return &RunResult{
			ID:        runID,
			FileID:    file.ID,
			FileName:  file.Name,
			Mode:      "oneshot",
			Status:    "done",
			Messages:  resp.Messages,
			Timestamp: now,
		}, nil
	}

	outputJSON, _ := json.Marshal(resp.Messages)
	_ = r.db.UpdateScriptRun(runID, string(outputJSON), "running")
	return &RunResult{
		ID:        runID,
		FileID:    file.ID,
		FileName:  file.Name,
		Mode:      "streaming",
		Status:    "running",
		Messages:  resp.Messages,
		Timestamp: now,
	}, nil
}

func (r *Runner) GetOutput(
	sessionID, name string,
	since, limit int,
) (*bridge.GetScriptOutputResponse, error) {
	return r.manager.GetScriptOutput(sessionID, name, since, limit)
}

func (r *Runner) Stop(
	sessionID, name string,
) (*bridge.StopScriptResponse, error) {
	resp, err := r.manager.StopScript(sessionID, name)
	if err != nil {
		return nil, err
	}

	if file, err := r.db.GetScriptFile(sessionID, name); err == nil &&
		file != nil {
		outputJSON, _ := json.Marshal(resp.Messages)
		_ = r.db.CompleteScriptRunByFile(sessionID, file.ID, string(outputJSON))
	}

	return resp, nil
}

func (r *Runner) ListRuns(sessionID string) ([]db.ScriptRunRow, error) {
	return r.db.GetScriptRuns(sessionID)
}

func (r *Runner) HasErrors(messages []json.RawMessage) bool {
	for _, msg := range messages {
		var obj map[string]any
		if json.Unmarshal(msg, &obj) == nil {
			if _, ok := obj["error"]; ok {
				return true
			}
		}
	}
	return false
}
