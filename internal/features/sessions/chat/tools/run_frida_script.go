package tools

import (
	"context"
	"fmt"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/scripting"
)

type RunFridaScriptParams struct {
	Name string `json:"name" description:"Name of the script file to compile and run (e.g. hook_crypto.ts)"`
}

type RunFridaScriptTool struct {
	runner    *scripting.Runner
	sessionID string
}

func NewRunFridaScript(
	runner *scripting.Runner,
	sessionID string,
) *RunFridaScriptTool {
	return &RunFridaScriptTool{runner: runner, sessionID: sessionID}
}

func (t *RunFridaScriptTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"run_frida_script",
		"Compile and execute a saved Frida script. One-shot scripts (that send __done) return output immediately. Hook scripts start in the background — use get_script_output to read intercepted data.",
		RunFridaScriptParams{},
	)
}

func (t *RunFridaScriptTool) Run(
	ctx context.Context,
	params tool.ToolCall,
) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[RunFridaScriptParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("invalid input: %v", err),
		), nil
	}

	if input.Name == "" {
		return tool.NewTextErrorResponse("name is required"), nil
	}

	res, err := t.runner.Run(t.sessionID, input.Name, 3)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("script execution failed: %v", err),
		), nil
	}

	if res.Error != "" {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("script execution failed: %s", res.Error),
		), nil
	}

	if res.Mode == "oneshot" {
		if len(res.Messages) == 0 {
			return tool.NewTextResponse(
				"Script executed successfully but produced no send() output.",
			), nil
		}
		return tool.NewJSONResponse(res.Messages), nil
	}

	result := map[string]any{
		"status":   "running",
		"name":     input.Name,
		"messages": res.Messages,
	}

	if t.runner.HasErrors(res.Messages) {
		resp := tool.NewJSONResponse(result)
		resp.IsError = true
		return resp, nil
	}

	return tool.NewJSONResponse(result), nil
}
