package tools

import (
	"context"
	"fmt"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/bridge"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type SchemaProvider interface {
	GetTables(
		setup session.DeviceSetup,
		deviceID, bundleID, sessionID, dbPath string,
	) ([]bridge.DatabaseTable, error)
}

type GetSchemaParams struct {
	DbPath string `json:"db_path" description:"Absolute path to the SQLite database file on the device."`
}

type GetSchemaTool struct {
	provider  SchemaProvider
	manager   *session.Manager
	sessionID string
}

func NewGetSchema(
	provider SchemaProvider,
	manager *session.Manager,
	sessionID string,
) *GetSchemaTool {
	return &GetSchemaTool{
		provider:  provider,
		manager:   manager,
		sessionID: sessionID,
	}
}

func (t *GetSchemaTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"get_schema",
		`Get the schema of a SQLite database from the target device.
Returns all table names and their column definitions (name, type, constraints).
The database is pulled from the device automatically.`,
		GetSchemaParams{},
	)
}

func (t *GetSchemaTool) Run(
	ctx context.Context,
	params tool.ToolCall,
) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[GetSchemaParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("invalid input: %v", err),
		), nil
	}

	if input.DbPath == "" {
		return tool.NewTextErrorResponse("db_path is required"), nil
	}

	sess := t.manager.GetSession(t.sessionID)
	if sess == nil {
		return tool.NewTextErrorResponse("session not found"), nil
	}

	dc := t.manager.GetDeviceConnection(sess.DeviceID)
	if dc == nil {
		return tool.NewTextErrorResponse("device not connected"), nil
	}

	tables, err := t.provider.GetTables(
		dc.Setup,
		sess.DeviceID,
		sess.BundleID,
		t.sessionID,
		input.DbPath,
	)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("get_schema failed: %v", err),
		), nil
	}

	if len(tables) == 0 {
		return tool.NewTextResponse("No tables found in this database."), nil
	}

	return tool.NewJSONResponse(tables), nil
}
