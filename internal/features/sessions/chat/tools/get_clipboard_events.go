package tools

import (
	"context"
	"fmt"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/db"
)

type GetClipboardEventsParams struct {
	Direction    string `json:"direction,omitempty"     description:"Filter by direction: read or write"`
	ContentQuery string `json:"content_query,omitempty" description:"Search clipboard content for this substring"`
	Limit        int    `json:"limit,omitempty"         description:"Max results to return (default 50)"`
}

type GetClipboardEventsTool struct {
	db        *db.DB
	sessionID string
}

func NewGetClipboardEvents(
	database *db.DB,
	sessionID string,
) *GetClipboardEventsTool {
	return &GetClipboardEventsTool{db: database, sessionID: sessionID}
}

func (t *GetClipboardEventsTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"get_clipboard_events",
		`Get recent clipboard read/write events captured by Frida on the target device.
Returns direction (read/write), text content, MIME type, and caller stack trace.
Use to find OTPs, passwords, card numbers, tokens, or other sensitive data the app reads from or writes to the clipboard.
Flag any sensitive content as a finding and correlate clipboard writes with subsequent network requests.`,
		GetClipboardEventsParams{},
	)
}

func (t *GetClipboardEventsTool) Run(
	ctx context.Context,
	params tool.ToolCall,
) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[GetClipboardEventsParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("invalid input: %v", err),
		), nil
	}

	rows, err := t.db.SearchClipboardEvents(
		t.sessionID,
		input.Direction,
		input.ContentQuery,
		input.Limit,
	)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("search failed: %v", err),
		), nil
	}

	if len(rows) == 0 {
		return tool.NewTextResponse("No clipboard events found."), nil
	}

	type result struct {
		ID          string  `json:"id"`
		Direction   string  `json:"direction"`
		Content     *string `json:"content,omitempty"`
		MimeType    *string `json:"mimeType,omitempty"`
		CallerStack *string `json:"callerStack,omitempty"`
		Timestamp   int64   `json:"timestamp"`
	}

	results := make([]result, len(rows))
	for i, r := range rows {
		results[i] = result{
			ID:          r.ID,
			Direction:   r.Direction,
			Content:     r.Content,
			MimeType:    r.MimeType,
			CallerStack: r.CallerStack,
			Timestamp:   r.Timestamp,
		}
	}

	return tool.NewJSONResponse(results), nil
}
