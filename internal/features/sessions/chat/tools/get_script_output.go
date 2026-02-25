package tools

import (
	"context"
	"fmt"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/scripting"
)

type GetScriptOutputParams struct {
	Name  string `json:"name" description:"Name of the running script (e.g. hook_crypto.ts)"`
	Since int    `json:"since,omitempty" description:"Message index offset to start from (default 0, for pagination)"`
	Limit int    `json:"limit,omitempty" description:"Max messages to return (default 100)"`
}

type GetScriptOutputTool struct {
	runner    *scripting.Runner
	sessionID string
}

func NewGetScriptOutput(runner *scripting.Runner, sessionID string) *GetScriptOutputTool {
	return &GetScriptOutputTool{runner: runner, sessionID: sessionID}
}

func (t *GetScriptOutputTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"get_script_output",
		"Read collected output from a running Frida script. Supports pagination with since/limit params.",
		GetScriptOutputParams{},
	)
}

func (t *GetScriptOutputTool) Run(ctx context.Context, params tool.ToolCall) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[GetScriptOutputParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(fmt.Sprintf("invalid input: %v", err)), nil
	}

	if input.Name == "" {
		return tool.NewTextErrorResponse("name is required"), nil
	}

	limit := input.Limit
	if limit <= 0 {
		limit = 100
	}

	resp, err := t.runner.GetOutput(t.sessionID, input.Name, input.Since, limit)
	if err != nil {
		return tool.NewTextErrorResponse(fmt.Sprintf("failed to get script output: %v", err)), nil
	}

	return tool.NewJSONResponse(resp), nil
}
