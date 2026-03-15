package tools

import (
	"context"
	"fmt"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/scripting"
)

type RunFridaScriptParams struct {
	Name string `json:"name" description:"Name of the script file to compile and run, including folder path (e.g. com.example.app/hook_crypto.ts)"`
}

type RunFridaScriptTool struct {
	runner    *scripting.Runner
	sessionID string
	deviceID  string
}

func NewRunFridaScript(
	runner *scripting.Runner,
	sessionID string,
	deviceID string,
) *RunFridaScriptTool {
	return &RunFridaScriptTool{
		runner:    runner,
		sessionID: sessionID,
		deviceID:  deviceID,
	}
}

func (t *RunFridaScriptTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"run_frida_script",
		`Compile and execute a saved Frida script on the target device.
One-shot scripts (that send __done) return output immediately.
Hook scripts start in the background — use get_script_output to read intercepted data.
Scripts run inside the app's process on the device, not in Docker.`,
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

	res, err := t.runner.Run(t.sessionID, t.deviceID, input.Name, 3)
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
