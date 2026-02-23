package tools

import (
	"context"
	"fmt"

	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type ListPendingRequestsParams struct{}

type ListPendingRequestsTool struct {
	manager   *session.Manager
	sessionID string
}

func NewListPendingRequests(manager *session.Manager, sessionID string) *ListPendingRequestsTool {
	return &ListPendingRequestsTool{manager: manager, sessionID: sessionID}
}

func (t *ListPendingRequestsTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"list_pending_requests",
		"List all currently intercepted/paused HTTP requests waiting for a decision. Returns request ID, method, URL, headers, and body for each pending request. Use this to see what requests are available to modify or forward.",
		ListPendingRequestsParams{},
	)
}

func (t *ListPendingRequestsTool) Run(ctx context.Context, params tool.ToolCall) (tool.ToolResponse, error) {
	sess := t.manager.GetSession(t.sessionID)
	if sess == nil || sess.Intercept == nil {
		return tool.NewTextErrorResponse("session not found or intercept not available"), nil
	}

	pending := sess.Intercept.ListPending()
	if len(pending) == 0 {
		return tool.NewTextResponse("No pending intercepted requests."), nil
	}

	type result struct {
		ID      string            `json:"id"`
		Method  string            `json:"method"`
		URL     string            `json:"url"`
		Headers map[string]string `json:"headers"`
		Body    *string           `json:"body,omitempty"`
	}

	results := make([]result, len(pending))
	for i, p := range pending {
		results[i] = result{
			ID:      p.ID,
			Method:  p.Method,
			URL:     p.URL,
			Headers: p.Headers,
			Body:    p.Body,
		}
	}

	return tool.NewJSONResponse(map[string]any{
		"count":   len(results),
		"pending": results,
		"hint":    fmt.Sprintf("Use modify_and_forward, forward_request, or drop_request with the request ID to act on these requests."),
	}), nil
}
