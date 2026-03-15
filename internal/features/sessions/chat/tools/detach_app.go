package tools

import (
	"context"
	"fmt"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type DetachAppParams struct {
	BundleID string `json:"bundle_id" description:"The bundle ID / package name of the app to detach from (e.g. com.example.app)"`
}

type DetachAppTool struct {
	manager  *session.Manager
	deviceID string
}

func NewDetachApp(manager *session.Manager, deviceID string) *DetachAppTool {
	return &DetachAppTool{manager: manager, deviceID: deviceID}
}

func (t *DetachAppTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"detach_app",
		`Detach Frida from a currently attached app by bundle ID.
Tears down the Frida session and stops log streaming, but keeps the device connected.`,
		DetachAppParams{},
	)
}

func (t *DetachAppTool) Run(
	ctx context.Context,
	params tool.ToolCall,
) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[DetachAppParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("invalid parameters: %v", err),
		), nil
	}

	if input.BundleID == "" {
		return tool.NewTextErrorResponse("bundle_id is required"), nil
	}

	sess := t.manager.FindSessionByBundle(t.deviceID, input.BundleID)
	if sess == nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("no active session found for %s", input.BundleID),
		), nil
	}

	if err := t.manager.DetachApp(sess.ID); err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("failed to detach from app: %v", err),
		), nil
	}

	return tool.NewTextResponse(
		fmt.Sprintf("Successfully detached from %s", input.BundleID),
	), nil
}
