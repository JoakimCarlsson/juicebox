package tools

import (
	"context"
	"fmt"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/db"
)

type ListFindingsParams struct {
	Severity string `json:"severity,omitempty" description:"Filter by severity: critical, high, medium, low, or info"`
}

type ListFindingsTool struct {
	db        *db.DB
	sessionID string
}

func NewListFindings(database *db.DB, sessionID string) *ListFindingsTool {
	return &ListFindingsTool{db: database, sessionID: sessionID}
}

func (t *ListFindingsTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"list_findings",
		`List all saved findings for the current session.
Optionally filter by severity. Use to review what has been found so far or to summarise the assessment.`,
		ListFindingsParams{},
	)
}

func (t *ListFindingsTool) Run(
	ctx context.Context,
	params tool.ToolCall,
) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[ListFindingsParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("invalid input: %v", err),
		), nil
	}

	findings, err := t.db.ListFindings(ctx, t.sessionID)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("failed to list findings: %v", err),
		), nil
	}

	if input.Severity != "" {
		filtered := make([]db.FindingRow, 0)
		for _, f := range findings {
			if f.Severity == input.Severity {
				filtered = append(filtered, f)
			}
		}
		findings = filtered
	}

	if len(findings) == 0 {
		return tool.NewTextResponse("No findings recorded."), nil
	}

	return tool.NewJSONResponse(findings), nil
}
