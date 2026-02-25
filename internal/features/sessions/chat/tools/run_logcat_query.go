package tools

import (
	"context"
	"fmt"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/db"
)

type RunLogcatQueryParams struct {
	Tag   string `json:"tag,omitempty"   description:"Filter by log tag (substring match)"`
	Text  string `json:"text,omitempty"  description:"Filter by message text (substring match)"`
	Level string `json:"level,omitempty" description:"Filter by log level (V, D, I, W, E, F)"`
	Limit int    `json:"limit,omitempty" description:"Max results to return (default 100)"`
}

type RunLogcatQueryTool struct {
	db        *db.DB
	sessionID string
}

func NewRunLogcatQuery(database *db.DB, sessionID string) *RunLogcatQueryTool {
	return &RunLogcatQueryTool{db: database, sessionID: sessionID}
}

func (t *RunLogcatQueryTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"run_logcat_query",
		"Search Android logcat entries for this session. Filter by tag, message text, or log level. Returns matching log lines with timestamp, PID, level, tag, and message.",
		RunLogcatQueryParams{},
	)
}

func (t *RunLogcatQueryTool) Run(
	ctx context.Context,
	params tool.ToolCall,
) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[RunLogcatQueryParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("invalid input: %v", err),
		), nil
	}

	rows, err := t.db.SearchLogcatEntries(
		t.sessionID,
		input.Tag,
		input.Text,
		input.Level,
		input.Limit,
	)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("search failed: %v", err),
		), nil
	}

	if len(rows) == 0 {
		return tool.NewTextResponse("No matching logcat entries found."), nil
	}

	type result struct {
		Timestamp string `json:"timestamp"`
		PID       int    `json:"pid"`
		Level     string `json:"level"`
		Tag       string `json:"tag"`
		Message   string `json:"message"`
	}

	results := make([]result, len(rows))
	for i, r := range rows {
		results[i] = result{
			Timestamp: r.Timestamp,
			PID:       r.PID,
			Level:     r.Level,
			Tag:       r.Tag,
			Message:   r.Message,
		}
	}

	return tool.NewJSONResponse(results), nil
}
