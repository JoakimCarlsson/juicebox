package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/db"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type RunFridaScriptParams struct {
	Name string `json:"name" description:"Name of the script file to compile and run (e.g. hook_crypto.ts)"`
}

type RunFridaScriptTool struct {
	manager   *session.Manager
	db        *db.DB
	sessionID string
}

func NewRunFridaScript(manager *session.Manager, database *db.DB, sessionID string) *RunFridaScriptTool {
	return &RunFridaScriptTool{manager: manager, db: database, sessionID: sessionID}
}

func (t *RunFridaScriptTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"run_frida_script",
		"Compile and execute a saved Frida script by filename. The script must have been written first using <file-write> tags. Returns all send() payloads as a JSON array.",
		RunFridaScriptParams{},
	)
}

func (t *RunFridaScriptTool) Run(ctx context.Context, params tool.ToolCall) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[RunFridaScriptParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(fmt.Sprintf("invalid input: %v", err)), nil
	}

	if input.Name == "" {
		return tool.NewTextErrorResponse("name is required"), nil
	}

	file, err := t.db.GetScriptFile(t.sessionID, input.Name)
	if err != nil || file == nil {
		return tool.NewTextErrorResponse(fmt.Sprintf("script file %q not found", input.Name)), nil
	}

	liveSess := t.manager.GetSession(t.sessionID)
	if liveSess == nil {
		return tool.NewTextErrorResponse("active session not found"), nil
	}

	runID := fmt.Sprintf("sr_%d", time.Now().UnixNano())
	now := time.Now().UnixMilli()

	_ = t.db.InsertScriptRun(db.ScriptRunRow{
		ID:           runID,
		SessionID:    t.sessionID,
		ScriptFileID: file.ID,
		Status:       "running",
		Timestamp:    now,
	})

	resp, err := t.manager.RunScript(t.sessionID, file.Content, 30)
	if err != nil {
		_ = t.db.UpdateScriptRun(runID, "", "error")
		return tool.NewTextErrorResponse(fmt.Sprintf(
			"script execution failed: %v\n\nCurrent source of %s:\n```\n%s\n```",
			err, input.Name, file.Content,
		)), nil
	}

	outputJSON, _ := json.Marshal(resp.Messages)
	_ = t.db.UpdateScriptRun(runID, string(outputJSON), "done")

	if len(resp.Messages) == 0 {
		return tool.NewTextResponse("Script executed successfully but produced no send() output."), nil
	}

	return tool.NewJSONResponse(resp.Messages), nil
}
