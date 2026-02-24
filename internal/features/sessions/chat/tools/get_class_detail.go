package tools

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type GetClassDetailParams struct {
	ClassName string `json:"className" description:"Fully qualified Java class name (e.g. 'com.example.auth.TokenManager')"`
}

type GetClassDetailTool struct {
	manager   *session.Manager
	sessionID string
}

func NewGetClassDetail(manager *session.Manager, sessionID string) *GetClassDetailTool {
	return &GetClassDetailTool{manager: manager, sessionID: sessionID}
}

func (t *GetClassDetailTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"get_class_detail",
		"Inspect a Java class at runtime. Returns declared methods (name, params, return type, modifiers), fields (name, type, modifiers, static values), implemented interfaces, and superclass chain.",
		GetClassDetailParams{},
	)
}

func (t *GetClassDetailTool) Run(ctx context.Context, params tool.ToolCall) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[GetClassDetailParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(fmt.Sprintf("invalid input: %v", err)), nil
	}

	if input.ClassName == "" {
		return tool.NewTextErrorResponse("className is required"), nil
	}

	raw, err := t.manager.AgentInvoke(t.sessionID, "classes", "detail", []any{input.ClassName})
	if err != nil {
		return tool.NewTextErrorResponse(fmt.Sprintf("failed to get class detail: %v", err)), nil
	}

	var detail json.RawMessage = raw
	return tool.NewJSONResponse(detail), nil
}
