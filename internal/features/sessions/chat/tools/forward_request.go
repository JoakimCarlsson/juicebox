package tools

import (
	"context"
	"fmt"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/proxy"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type ForwardRequestParams struct {
	RequestID string `json:"request_id" description:"The ID of the pending intercepted request to forward as-is"`
}

type ForwardRequestTool struct {
	manager   *session.Manager
	sessionID string
}

func NewForwardRequest(
	manager *session.Manager,
	sessionID string,
) *ForwardRequestTool {
	return &ForwardRequestTool{manager: manager, sessionID: sessionID}
}

func (t *ForwardRequestTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"forward_request",
		"Forward a paused/intercepted HTTP request to the server without any modifications.",
		ForwardRequestParams{},
	)
}

func (t *ForwardRequestTool) Run(
	ctx context.Context,
	params tool.ToolCall,
) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[ForwardRequestParams](params.Input)
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
		Action:    proxy.ActionForward,
	}

	if err := dc.Intercept.Resolve(decision); err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("failed to resolve: %v", err),
		), nil
	}

	return tool.NewTextResponse(
		fmt.Sprintf("Request %s forwarded.", input.RequestID),
	), nil
}
