package tools

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type ListClassesParams struct {
	Query string `json:"query" description:"Substring to filter class names by (e.g. 'auth', 'com.example'). Empty returns all."`
}

type ListClassesTool struct {
	manager   *session.Manager
	sessionID string
}

func NewListClasses(
	manager *session.Manager,
	sessionID string,
) *ListClassesTool {
	return &ListClassesTool{manager: manager, sessionID: sessionID}
}

func (t *ListClassesTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"list_classes",
		"Search loaded Java classes in the running app. Returns fully qualified class names matching the query substring. Useful for finding classes related to authentication, networking, crypto, etc.",
		ListClassesParams{},
	)
}

func (t *ListClassesTool) Run(
	ctx context.Context,
	params tool.ToolCall,
) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[ListClassesParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("invalid input: %v", err),
		), nil
	}

	raw, err := t.manager.AgentInvoke(
		t.sessionID,
		"classes",
		"list",
		[]any{input.Query},
	)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("failed to list classes: %v", err),
		), nil
	}

	var classes []string
	if err := json.Unmarshal(raw, &classes); err != nil {
		return tool.NewTextErrorResponse("failed to parse class list"), nil
	}

	if len(classes) == 0 {
		return tool.NewTextResponse(
			fmt.Sprintf("No loaded classes matching %q found.", input.Query),
		), nil
	}

	return tool.NewJSONResponse(classes), nil
}
