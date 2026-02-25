package tools

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type LaunchIntentParams struct {
	Component  string                            `json:"component" description:"Fully qualified component name (e.g. com.example.app.LoginActivity)"`
	Type       string                            `json:"type" description:"Component type: activity, service, or broadcast"`
	Action     string                            `json:"action,omitempty" description:"Intent action (e.g. android.intent.action.VIEW)"`
	Data       string                            `json:"data,omitempty" description:"Data URI (e.g. content://com.example/data)"`
	Categories []string                          `json:"categories,omitempty" description:"Intent categories"`
	Extras     map[string]LaunchIntentExtraParam `json:"extras,omitempty" description:"Extra key-value pairs to attach to the intent"`
	Flags      int                               `json:"flags,omitempty" description:"Intent flags as integer bitmask"`
}

type LaunchIntentExtraParam struct {
	Type  string `json:"type" description:"Value type: string, int, boolean, float, long, double"`
	Value any    `json:"value" description:"The value"`
}

type LaunchIntentTool struct {
	manager   *session.Manager
	sessionID string
}

func NewLaunchIntent(manager *session.Manager, sessionID string) *LaunchIntentTool {
	return &LaunchIntentTool{manager: manager, sessionID: sessionID}
}

func (t *LaunchIntentTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"launch_intent",
		"Fire an intent at a target component in the running app. Use with get_manifest to test exported components — try path traversal on data URIs, oversized extras, and type confusion for component fuzzing.",
		LaunchIntentParams{},
	)
}

func (t *LaunchIntentTool) Run(ctx context.Context, params tool.ToolCall) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[LaunchIntentParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(fmt.Sprintf("invalid input: %v", err)), nil
	}

	if input.Component == "" {
		return tool.NewTextErrorResponse("component is required"), nil
	}
	if input.Type == "" {
		return tool.NewTextErrorResponse("type is required (activity, service, or broadcast)"), nil
	}

	intentParams := map[string]any{
		"component": input.Component,
		"type":      input.Type,
	}
	if input.Action != "" {
		intentParams["action"] = input.Action
	}
	if input.Data != "" {
		intentParams["data"] = input.Data
	}
	if len(input.Categories) > 0 {
		intentParams["categories"] = input.Categories
	}
	if len(input.Extras) > 0 {
		extras := make(map[string]any, len(input.Extras))
		for k, v := range input.Extras {
			extras[k] = map[string]any{"type": v.Type, "value": v.Value}
		}
		intentParams["extras"] = extras
	}
	if input.Flags != 0 {
		intentParams["flags"] = input.Flags
	}

	raw, err := t.manager.AgentInvoke(t.sessionID, "manifest", "launchIntent", []any{intentParams})
	if err != nil {
		return tool.NewTextErrorResponse(fmt.Sprintf("failed to launch intent: %v", err)), nil
	}

	var result any
	if err := json.Unmarshal(raw, &result); err != nil {
		return tool.NewTextErrorResponse("failed to parse intent result"), nil
	}

	return tool.NewJSONResponse(result), nil
}
