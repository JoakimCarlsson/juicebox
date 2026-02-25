package tools

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/scripting"
)

type StopFridaScriptParams struct {
	Name string `json:"name" description:"Name of the script to stop (e.g. hook_crypto.ts)"`
}

type StopFridaScriptTool struct {
	runner    *scripting.Runner
	sessionID string
}

func NewStopFridaScript(
	runner *scripting.Runner,
	sessionID string,
) *StopFridaScriptTool {
	return &StopFridaScriptTool{runner: runner, sessionID: sessionID}
}

func (t *StopFridaScriptTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"stop_frida_script",
		"Stop a running Frida script and return its final collected output.",
		StopFridaScriptParams{},
	)
}

func (t *StopFridaScriptTool) Run(
	ctx context.Context,
	params tool.ToolCall,
) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[StopFridaScriptParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("invalid input: %v", err),
		), nil
	}

	if input.Name == "" {
		return tool.NewTextErrorResponse("name is required"), nil
	}

	resp, err := t.runner.Stop(t.sessionID, input.Name)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("failed to stop script: %v", err),
		), nil
	}

	if len(resp.Messages) == 0 {
		return tool.NewTextResponse(
			fmt.Sprintf(
				"Script '%s' stopped. No output was collected.",
				input.Name,
			),
		), nil
	}

	result := map[string]any{
		"name":          resp.Name,
		"totalMessages": resp.TotalMessages,
		"messages":      json.RawMessage(mustMarshal(resp.Messages)),
	}
	return tool.NewJSONResponse(result), nil
}

func mustMarshal(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}
