package tools

import (
	"context"
	"fmt"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type AttachAppParams struct {
	BundleID string `json:"bundle_id" description:"The bundle ID / package name of the app to attach to (e.g. com.example.app)"`
}

type AttachAppTool struct {
	manager  *session.Manager
	deviceID string
}

func NewAttachApp(manager *session.Manager, deviceID string) *AttachAppTool {
	return &AttachAppTool{manager: manager, deviceID: deviceID}
}

func (t *AttachAppTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"attach_app",
		`Attach Frida to an app on the target device by bundle ID.
Spawns the app suspended, injects all matching scripts from the hooks editor, then resumes it.
Returns the session ID and PID.`,
		AttachAppParams{},
	)
}

func (t *AttachAppTool) Run(
	ctx context.Context,
	params tool.ToolCall,
) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[AttachAppParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("invalid parameters: %v", err),
		), nil
	}

	if input.BundleID == "" {
		return tool.NewTextErrorResponse("bundle_id is required"), nil
	}

	result, err := t.manager.AttachApp(t.deviceID, input.BundleID, nil)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("failed to attach to app: %v", err),
		), nil
	}

	return tool.NewJSONResponse(result), nil
}
