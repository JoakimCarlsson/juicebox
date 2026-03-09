package tools

import (
	"context"
	"fmt"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/db"
)

type GetFlutterEventsParams struct {
	Channel string `json:"channel,omitempty" description:"Filter by channel name substring (e.g. 'flutter/lifecycle', 'method_channel')"`
	Limit   int    `json:"limit,omitempty"   description:"Max results to return (default 50)"`
}

type GetFlutterEventsTool struct {
	db        *db.DB
	sessionID string
}

func NewGetFlutterEvents(
	database *db.DB,
	sessionID string,
) *GetFlutterEventsTool {
	return &GetFlutterEventsTool{db: database, sessionID: sessionID}
}

func (t *GetFlutterEventsTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"get_flutter_events",
		"Get recent Flutter platform channel events for this session. Returns channel name, method, direction (dart_to_native or native_to_dart), arguments, and result data. Use to investigate Flutter MethodChannel/EventChannel/BasicMessageChannel communication between Dart and native code. Useful for understanding payment flows, biometric auth, plugin calls, and other platform interactions.",
		GetFlutterEventsParams{},
	)
}

func (t *GetFlutterEventsTool) Run(
	ctx context.Context,
	params tool.ToolCall,
) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[GetFlutterEventsParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("invalid input: %v", err),
		), nil
	}

	rows, err := t.db.SearchFlutterChannels(
		t.sessionID,
		input.Channel,
		input.Limit,
	)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("search failed: %v", err),
		), nil
	}

	if len(rows) == 0 {
		return tool.NewTextResponse("No Flutter channel events found."), nil
	}

	type result struct {
		ID        string  `json:"id"`
		Channel   string  `json:"channel"`
		Method    *string `json:"method,omitempty"`
		Direction string  `json:"direction"`
		Arguments *string `json:"arguments,omitempty"`
		Result    *string `json:"result,omitempty"`
		Timestamp int64   `json:"timestamp"`
	}

	results := make([]result, len(rows))
	for i, r := range rows {
		results[i] = result{
			ID:        r.ID,
			Channel:   r.Channel,
			Method:    r.Method,
			Direction: r.Direction,
			Arguments: r.Arguments,
			Result:    r.Result,
			Timestamp: r.Timestamp,
		}
	}

	return tool.NewJSONResponse(results), nil
}
