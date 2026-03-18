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
	Title       string `json:"title"       description:"Title of the finding"`
	Severity    string `json:"severity"    description:"Severity: critical, high, medium, low, or info"`
	Description string `json:"description" description:"Detailed description of the finding"`
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
		`Save a security finding for the current session.
Use this when you discover something notable — a vulnerability, misconfiguration, hardcoded secret, insecure API usage, etc.
The finding is persisted and visible in the Findings tab.`,
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
