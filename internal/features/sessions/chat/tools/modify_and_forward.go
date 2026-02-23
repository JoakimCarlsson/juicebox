package tools

import (
	"context"
	"fmt"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/proxy"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type ModifyAndForwardParams struct {
	RequestID string            `json:"request_id" description:"The ID of the pending intercepted request to modify and forward"`
	Method    *string           `json:"method,omitempty" description:"Modified HTTP method (GET, POST, PUT, etc.)"`
	URL       *string           `json:"url,omitempty" description:"Modified URL"`
	Headers   map[string]string `json:"headers,omitempty" description:"Modified headers (replaces all headers if provided)"`
	Body      *string           `json:"body,omitempty" description:"Modified request body"`
}

type ModifyAndForwardTool struct {
	manager   *session.Manager
	sessionID string
}

func NewModifyAndForward(manager *session.Manager, sessionID string) *ModifyAndForwardTool {
	return &ModifyAndForwardTool{manager: manager, sessionID: sessionID}
}

func (t *ModifyAndForwardTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"modify_and_forward",
		"Modify a paused/intercepted HTTP request and forward it to the server. Use this when intercept mode has captured a request and you want to change it before forwarding. You can modify the method, URL, headers, and body. Fields not provided will keep their original values. Returns the confirmation that the request was forwarded.",
		ModifyAndForwardParams{},
	)
}

func (t *ModifyAndForwardTool) Run(ctx context.Context, params tool.ToolCall) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[ModifyAndForwardParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(fmt.Sprintf("invalid input: %v", err)), nil
	}

	sess := t.manager.GetSession(t.sessionID)
	if sess == nil || sess.Intercept == nil {
		return tool.NewTextErrorResponse("session not found or intercept not available"), nil
	}

	decision := proxy.InterceptDecision{
		RequestID: input.RequestID,
		Action:    proxy.ActionModify,
		Method:    input.Method,
		URL:       input.URL,
		Headers:   input.Headers,
		Body:      input.Body,
	}

	if err := sess.Intercept.Resolve(decision); err != nil {
		return tool.NewTextErrorResponse(fmt.Sprintf("failed to resolve: %v", err)), nil
	}

	return tool.NewTextResponse(fmt.Sprintf("Request %s modified and forwarded.", input.RequestID)), nil
}
