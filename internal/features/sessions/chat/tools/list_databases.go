package tools

import (
	"context"
	"fmt"

	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/bridge"
)

type ListDatabasesParams struct{}

type ListDatabasesTool struct {
	bridge   *bridge.Client
	deviceID string
	bundleID string
}

func NewListDatabases(bridgeClient *bridge.Client, deviceID, bundleID string) *ListDatabasesTool {
	return &ListDatabasesTool{bridge: bridgeClient, deviceID: deviceID, bundleID: bundleID}
}

func (t *ListDatabasesTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"list_databases",
		"List all SQLite database files (.db) in the app's data directory. Returns an array of absolute paths.",
		ListDatabasesParams{},
	)
}

func (t *ListDatabasesTool) Run(ctx context.Context, params tool.ToolCall) (tool.ToolResponse, error) {
	basePath := "/data/data/" + t.bundleID

	paths, err := t.bridge.FindFiles(t.deviceID, t.bundleID, "*.db", basePath)
	if err != nil {
		return tool.NewTextErrorResponse(fmt.Sprintf("list_databases failed: %v", err)), nil
	}

	if len(paths) == 0 {
		return tool.NewTextResponse("No SQLite databases found in the app sandbox."), nil
	}

	return tool.NewJSONResponse(paths), nil
}
