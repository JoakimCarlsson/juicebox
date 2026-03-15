package tools

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type ScanMemoryParams struct {
	Pattern    string `json:"pattern"              description:"Byte pattern to search for in process memory. Can be a hex pattern with wildcards (e.g. '65 79 4A ?? ??') or a plain string (e.g. 'eyJ', 'Bearer ', 'sk_live_')."`
	MaxResults int    `json:"maxResults,omitempty" description:"Maximum number of matches to return. Defaults to 100."`
}

type ScanMemoryTool struct {
	manager   *session.Manager
	sessionID string
}

func NewScanMemory(
	manager *session.Manager,
	sessionID string,
) *ScanMemoryTool {
	return &ScanMemoryTool{manager: manager, sessionID: sessionID}
}

func (t *ScanMemoryTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"scan_memory",
		`Search the live process heap on the target device for a byte pattern.
Finds secrets like JWT tokens (search 'eyJ'), API keys (search 'sk_live_', 'AKIA'), passwords, Bearer tokens, and any other strings or byte sequences in memory.
Returns matching addresses with hex dump and ASCII preview of surrounding bytes.`,
		ScanMemoryParams{},
	)
}

func (t *ScanMemoryTool) Run(
	ctx context.Context,
	params tool.ToolCall,
) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[ScanMemoryParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("invalid input: %v", err),
		), nil
	}

	if input.Pattern == "" {
		return tool.NewTextErrorResponse("pattern is required"), nil
	}

	args := []any{input.Pattern}
	if input.MaxResults > 0 {
		args = append(args, input.MaxResults)
	}

	raw, err := t.manager.AgentInvoke(
		t.sessionID,
		"memory",
		"scanSync",
		args,
	)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("memory scan failed: %v", err),
		), nil
	}

	var matches []json.RawMessage
	if err := json.Unmarshal(raw, &matches); err != nil {
		return tool.NewTextErrorResponse("failed to parse scan results"), nil
	}

	if len(matches) == 0 {
		return tool.NewTextResponse(
			fmt.Sprintf(
				"No matches for pattern %q found in process memory.",
				input.Pattern,
			),
		), nil
	}

	return tool.NewJSONResponse(json.RawMessage(raw)), nil
}
