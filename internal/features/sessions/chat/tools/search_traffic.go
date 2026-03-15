package tools

import (
	"context"
	"fmt"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/db"
)

type SearchTrafficParams struct {
	Method       string `json:"method,omitempty"        description:"HTTP method filter (GET, POST, etc.)"`
	Host         string `json:"host,omitempty"          description:"Host or URL substring to filter by"`
	StatusCode   *int   `json:"status_code,omitempty"   description:"HTTP status code to filter by"`
	BodyContains string `json:"body_contains,omitempty" description:"Text to search for in request or response bodies"`
	Limit        int    `json:"limit,omitempty"         description:"Max results to return (default 50)"`
}

type SearchTrafficTool struct {
	db        *db.DB
	sessionID string
}

func NewSearchTraffic(database *db.DB, sessionID string) *SearchTrafficTool {
	return &SearchTrafficTool{db: database, sessionID: sessionID}
}

func (t *SearchTrafficTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"search_traffic",
		`Search captured HTTP requests and responses for this session.
Filter by method, host/URL, status code, or body content.
Returns a list of matching requests with their ID, method, URL, status, and duration.`,
		SearchTrafficParams{},
	)
}

func (t *SearchTrafficTool) Run(
	ctx context.Context,
	params tool.ToolCall,
) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[SearchTrafficParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("invalid input: %v", err),
		), nil
	}

	rows, err := t.db.SearchHttpMessages(
		t.sessionID,
		input.Method,
		input.Host,
		input.StatusCode,
		input.BodyContains,
		input.Limit,
	)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("search failed: %v", err),
		), nil
	}

	if len(rows) == 0 {
		return tool.NewTextResponse("No matching HTTP requests found."), nil
	}

	type result struct {
		ID         string `json:"id"`
		Method     string `json:"method"`
		URL        string `json:"url"`
		StatusCode int    `json:"status_code"`
		Duration   int64  `json:"duration_ms"`
		Timestamp  int64  `json:"timestamp"`
	}

	results := make([]result, len(rows))
	for i, r := range rows {
		results[i] = result{
			ID:         r.ID,
			Method:     r.Method,
			URL:        r.URL,
			StatusCode: r.StatusCode,
			Duration:   r.Duration,
			Timestamp:  r.Timestamp,
		}
	}

	return tool.NewJSONResponse(results), nil
}
