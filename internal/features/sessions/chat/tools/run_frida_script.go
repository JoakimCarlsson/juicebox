package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/db"
	"github.com/joakimcarlsson/juicebox/internal/devicehub"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type RunFridaScriptParams struct {
	Code string `json:"code" description:"Frida TypeScript code to compile and inject into the live app process. Use send() to return data."`
}

type RunFridaScriptTool struct {
	manager    *session.Manager
	db         *db.DB
	sessionID  string
	hubManager *devicehub.Manager
}

func NewRunFridaScript(manager *session.Manager, database *db.DB, sessionID string, hubManager *devicehub.Manager) *RunFridaScriptTool {
	return &RunFridaScriptTool{manager: manager, db: database, sessionID: sessionID, hubManager: hubManager}
}

func (t *RunFridaScriptTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"run_frida_script",
		"Write and execute arbitrary Frida TypeScript against the live app process. The code is compiled and injected via session.createScript(). Use send() to return data back. The script runs for up to 30 seconds collecting all send() payloads. Returns the collected output as a JSON array.",
		RunFridaScriptParams{},
	)
}

func (t *RunFridaScriptTool) Run(ctx context.Context, params tool.ToolCall) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[RunFridaScriptParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(fmt.Sprintf("invalid input: %v", err)), nil
	}

	if input.Code == "" {
		return tool.NewTextErrorResponse("code is required"), nil
	}

	liveSess := t.manager.GetSession(t.sessionID)
	if liveSess == nil {
		return tool.NewTextErrorResponse("active session not found"), nil
	}

	scriptID := fmt.Sprintf("scr_%d", time.Now().UnixNano())
	now := time.Now().UnixMilli()

	_ = t.db.InsertScript(db.ScriptRow{
		ID:        scriptID,
		SessionID: t.sessionID,
		Code:      input.Code,
		Status:    "running",
		Timestamp: now,
	})

	hub := t.hubManager.GetOrCreate(liveSess.DeviceID)
	scriptRunPayload, _ := json.Marshal(map[string]any{
		"scriptId": scriptID,
		"code":     input.Code,
		"source":   "ai",
	})
	if data, err := devicehub.Marshal("script_run", t.sessionID, json.RawMessage(scriptRunPayload)); err == nil {
		hub.Broadcast(data)
	}

	resp, err := t.manager.RunScript(t.sessionID, input.Code, 30)
	if err != nil {
		_ = t.db.UpdateScriptOutput(scriptID, "", "error")
		return tool.NewTextErrorResponse(fmt.Sprintf("script execution failed: %v", err)), nil
	}

	outputJSON, _ := json.Marshal(resp.Messages)
	_ = t.db.UpdateScriptOutput(scriptID, string(outputJSON), "done")

	if len(resp.Messages) == 0 {
		return tool.NewTextResponse("Script executed successfully but produced no send() output."), nil
	}

	return tool.NewJSONResponse(resp.Messages), nil
}
