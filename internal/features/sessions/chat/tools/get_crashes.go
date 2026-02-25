package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/db"
)

type GetCrashesParams struct {
	Since string `json:"since,omitempty" description:"ISO timestamp to filter crashes after (e.g. 2025-01-01T00:00:00Z)"`
	Limit int    `json:"limit,omitempty" description:"Max results to return (default 50)"`
}

type GetCrashesTool struct {
	db        *db.DB
	sessionID string
}

func NewGetCrashes(database *db.DB, sessionID string) *GetCrashesTool {
	return &GetCrashesTool{db: database, sessionID: sessionID}
}

func (t *GetCrashesTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"get_crashes",
		"Get recent crash events (native signals and Java exceptions) for this session. Returns crash type, signal/exception info, stack traces, and register context. Use after running Frida scripts or launching intents to detect if the action caused a crash.",
		GetCrashesParams{},
	)
}

func (t *GetCrashesTool) Run(
	ctx context.Context,
	params tool.ToolCall,
) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[GetCrashesParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("invalid input: %v", err),
		), nil
	}

	var sinceTs int64
	if input.Since != "" {
		parsed, err := time.Parse(time.RFC3339, input.Since)
		if err == nil {
			sinceTs = parsed.UnixMilli()
		}
	}

	rows, err := t.db.SearchCrashes(t.sessionID, sinceTs, input.Limit)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("search failed: %v", err),
		), nil
	}

	if len(rows) == 0 {
		return tool.NewTextResponse("No crash events found."), nil
	}

	type result struct {
		ID               string            `json:"id"`
		CrashType        string            `json:"crash_type"`
		Signal           *string           `json:"signal,omitempty"`
		Address          *string           `json:"address,omitempty"`
		Registers        map[string]string `json:"registers,omitempty"`
		Backtrace        []string          `json:"backtrace,omitempty"`
		JavaStackTrace   *string           `json:"java_stack_trace,omitempty"`
		ExceptionClass   *string           `json:"exception_class,omitempty"`
		ExceptionMessage *string           `json:"exception_message,omitempty"`
		Timestamp        int64             `json:"timestamp"`
	}

	results := make([]result, len(rows))
	for i, r := range rows {
		res := result{
			ID:               r.ID,
			CrashType:        r.CrashType,
			Signal:           r.Signal,
			Address:          r.Address,
			JavaStackTrace:   r.JavaStackTrace,
			ExceptionClass:   r.ExceptionClass,
			ExceptionMessage: r.ExceptionMessage,
			Timestamp:        r.Timestamp,
		}
		if r.Registers != nil {
			var regs map[string]string
			if json.Unmarshal([]byte(*r.Registers), &regs) == nil {
				res.Registers = regs
			}
		}
		if r.Backtrace != nil {
			var bt []string
			if json.Unmarshal([]byte(*r.Backtrace), &bt) == nil {
				res.Backtrace = bt
			}
		}
		results[i] = res
	}

	return tool.NewJSONResponse(results), nil
}
