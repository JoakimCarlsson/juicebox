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
	RequestID       string            `json:"request_id"                 description:"The ID of the pending intercepted request to modify and forward"`
	Method          *string           `json:"method,omitempty"           description:"Modified HTTP method (GET, POST, PUT, etc.) — request phase only"`
	URL             *string           `json:"url,omitempty"              description:"Modified URL — request phase only"`
	Headers         map[string]string `json:"headers,omitempty"          description:"Modified request headers (replaces all headers if provided) — request phase only"`
	Body            *string           `json:"body,omitempty"             description:"Modified request body — request phase only"`
	StatusCode      *int              `json:"status_code,omitempty"      description:"Modified HTTP status code — response phase only"`
	ResponseHeaders map[string]string `json:"response_headers,omitempty" description:"Modified response headers (replaces all headers if provided) — response phase only"`
	ResponseBody    *string           `json:"response_body,omitempty"    description:"Modified response body — response phase only"`
}

type ModifyAndForwardTool struct {
	manager   *session.Manager
	sessionID string
}

func NewModifyAndForward(
	manager *session.Manager,
	sessionID string,
) *ModifyAndForwardTool {
	return &ModifyAndForwardTool{manager: manager, sessionID: sessionID}
}

func (t *ModifyAndForwardTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"modify_and_forward",
		"Modify a paused/intercepted HTTP request or response and forward it. For request-phase intercepts: modify method, URL, headers, body. For response-phase intercepts: modify status_code, response_headers, response_body. Fields not provided will keep their original values.",
		ModifyAndForwardParams{},
	)
}

func (t *ModifyAndForwardTool) Run(
	ctx context.Context,
	params tool.ToolCall,
) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[ModifyAndForwardParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("invalid input: %v", err),
		), nil
	}

	sess := t.manager.GetSession(t.sessionID)
	if sess == nil || sess.Intercept == nil {
		return tool.NewTextErrorResponse(
			"session not found or intercept not available",
		), nil
	}

	decision := proxy.InterceptDecision{
		RequestID:       input.RequestID,
		Action:          proxy.ActionModify,
		Method:          input.Method,
		URL:             input.URL,
		Headers:         input.Headers,
		Body:            input.Body,
		StatusCode:      input.StatusCode,
		ResponseHeaders: input.ResponseHeaders,
		ResponseBody:    input.ResponseBody,
	}

	if err := sess.Intercept.Resolve(decision); err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("failed to resolve: %v", err),
		), nil
	}

	return tool.NewTextResponse(
		fmt.Sprintf("Request %s modified and forwarded.", input.RequestID),
	), nil
}
