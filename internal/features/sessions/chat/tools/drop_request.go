package tools

import (
	"context"
	"fmt"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/proxy"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type DropRequestParams struct {
	RequestID string `json:"request_id" description:"The ID of the pending intercepted request to drop/block"`
}

type DropRequestTool struct {
	manager   *session.Manager
	sessionID string
}

func NewDropRequest(
	manager *session.Manager,
	sessionID string,
) *DropRequestTool {
	return &DropRequestTool{manager: manager, sessionID: sessionID}
}

func (t *DropRequestTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"drop_request",
		"Drop/block a paused/intercepted HTTP request, preventing it from reaching the server. The client will receive a 502 response.",
		DropRequestParams{},
	)
}

func (t *DropRequestTool) Run(
	ctx context.Context,
	params tool.ToolCall,
) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[DropRequestParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("invalid input: %v", err),
		), nil
	}

	sess := t.manager.GetSession(t.sessionID)
	if sess == nil {
		return tool.NewTextErrorResponse(
			"session not found or intercept not available",
		), nil
	}
	dc := t.manager.GetDeviceConnection(sess.DeviceID)
	if dc == nil || dc.Intercept == nil {
		return tool.NewTextErrorResponse(
			"session not found or intercept not available",
		), nil
	}

	decision := proxy.InterceptDecision{
		RequestID: input.RequestID,
		Action:    proxy.ActionDrop,
	}

	if err := dc.Intercept.Resolve(decision); err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("failed to resolve: %v", err),
		), nil
	}

	return tool.NewTextResponse(
		fmt.Sprintf("Request %s dropped.", input.RequestID),
	), nil
}
