package tools

import (
	"context"
	"fmt"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/db"
)

type GetJNIEventsParams struct {
	Library string `json:"library,omitempty" description:"Filter by native library name (e.g. libnative.so)"`
	Method  string `json:"method,omitempty" description:"Filter by method or class name substring"`
	Limit   int    `json:"limit,omitempty" description:"Max events to return (default 100)"`
}

type GetJNIEventsTool struct {
	db        *db.DB
	sessionID string
}

func NewGetJNIEvents(database *db.DB, sessionID string) *GetJNIEventsTool {
	return &GetJNIEventsTool{db: database, sessionID: sessionID}
}

func (t *GetJNIEventsTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"get_jni_events",
		"Get recent JNI call events — method name, class, arguments, return value, and native backtrace. Filter by library or method name. Useful for finding native crypto, licence checks, and root detection crossing the JNI boundary.",
		GetJNIEventsParams{},
	)
}

func (t *GetJNIEventsTool) Run(ctx context.Context, params tool.ToolCall) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[GetJNIEventsParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(fmt.Sprintf("invalid input: %v", err)), nil
	}

	limit := input.Limit
	if limit <= 0 {
		limit = 100
	}

	events, err := t.db.SearchJNIEvents(t.sessionID, input.Library, input.Method, limit)
	if err != nil {
		return tool.NewTextErrorResponse(fmt.Sprintf("failed to query jni events: %v", err)), nil
	}

	if len(events) == 0 {
		return tool.NewTextResponse("No JNI events found matching the filter."), nil
	}

	return tool.NewJSONResponse(events), nil
}
