package tools

import (
	"context"
	"fmt"

	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type ListDatabasesParams struct{}

type ListDatabasesTool struct {
	setup    session.DeviceSetup
	deviceID string
	bundleID string
}

func NewListDatabases(
	setup session.DeviceSetup,
	deviceID, bundleID string,
) *ListDatabasesTool {
	return &ListDatabasesTool{
		setup:    setup,
		deviceID: deviceID,
		bundleID: bundleID,
	}
}

func (t *ListDatabasesTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"list_databases",
		`List all SQLite database files (.db) in the app's data directory on the target device.
Returns an array of absolute paths.`,
		ListDatabasesParams{},
	)
}

func (t *ListDatabasesTool) Run(
	ctx context.Context,
	params tool.ToolCall,
) (tool.ToolResponse, error) {
	basePath := "/data/data/" + t.bundleID

	paths, err := t.setup.FindFiles(t.deviceID, t.bundleID, "*.db", basePath)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("list_databases failed: %v", err),
		), nil
	}

	if len(paths) == 0 {
		return tool.NewTextResponse(
			"No SQLite databases found in the app sandbox.",
		), nil
	}

	return tool.NewJSONResponse(paths), nil
}
