package tools

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/db"
	"github.com/joakimcarlsson/juicebox/internal/devicehub"
)

var validSeverities = map[string]bool{
	"critical": true,
	"high":     true,
	"medium":   true,
	"low":      true,
	"info":     true,
}

type SaveFindingParams struct {
	Title       string `json:"title"       description:"Short, descriptive title summarising the finding (e.g. 'Hardcoded AWS key in SharedPreferences', 'Missing certificate pinning on /api/auth')"`
	Severity    string `json:"severity"    description:"Risk severity: critical, high, medium, low, or info"`
	Description string `json:"description" description:"Full description of the finding. Include: what was found, where (endpoint, class, file), why it matters, technical details, and reproduction steps if applicable. Write as a self-contained report."`
}

type SaveFindingTool struct {
	db        *db.DB
	sessionID string
	deviceID  string
	hub       *devicehub.Hub
}

func NewSaveFinding(
	database *db.DB,
	sessionID, deviceID string,
	hub *devicehub.Hub,
) *SaveFindingTool {
	return &SaveFindingTool{
		db:        database,
		sessionID: sessionID,
		deviceID:  deviceID,
		hub:       hub,
	}
}

func (t *SaveFindingTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"save_finding",
		`Save a security finding for the current session. Call this whenever you identify something the tester should know about — vulnerabilities, misconfigurations, hardcoded secrets, insecure API patterns, missing certificate pinning, weak crypto, IDOR issues, excessive permissions, PII exposure, etc.

Severity guide:
- critical: Remote code execution, authentication bypass, full data breach potential
- high: Significant data exposure, privilege escalation, hardcoded credentials, SQL injection
- medium: Information disclosure, weak crypto, missing security headers, IDOR on non-sensitive resources
- low: Minor information leaks, verbose error messages, outdated dependencies with no known exploit
- info: Observations, notes, areas for further investigation, positive findings (e.g. pinning correctly implemented)
11
Write the description as a self-contained report: include what was found, where it was found, why it matters, and any relevant technical details (endpoints, parameter names, algorithms, etc). The description should be useful on its own without needing to reference other data.

The finding is persisted across conversations and visible in the Findings tab in real-time.`,
		SaveFindingParams{},
	)
}

func (t *SaveFindingTool) Run(
	ctx context.Context,
	params tool.ToolCall,
) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[SaveFindingParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("invalid input: %v", err),
		), nil
	}

	if input.Title == "" {
		return tool.NewTextErrorResponse("title is required"), nil
	}
	if !validSeverities[input.Severity] {
		return tool.NewTextErrorResponse(
			"severity must be critical, high, medium, low, or info",
		), nil
	}

	b := make([]byte, 16)
	_, _ = rand.Read(b)

	now := time.Now().UnixMilli()
	finding := &db.FindingRow{
		ID:          hex.EncodeToString(b),
		SessionID:   t.sessionID,
		Title:       input.Title,
		Severity:    input.Severity,
		Description: input.Description,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	if err := t.db.CreateFinding(ctx, finding); err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("failed to save finding: %v", err),
		), nil
	}

	if t.hub != nil {
		if data, err := devicehub.Marshal("finding", t.sessionID, finding); err == nil {
			t.hub.Broadcast(data)
		}
	}

	return tool.NewJSONResponse(finding), nil
}
