package tools

import (
	"context"
	"fmt"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/bridge"
)

type FindFilesParams struct {
	Pattern  string `json:"pattern" description:"Filename glob pattern (e.g. '*.xml', '*.db', 'shared_prefs')."`
	BasePath string `json:"base_path,omitempty" description:"Directory to search from. Defaults to the app's data directory."`
}

type FindFilesTool struct {
	bridge   *bridge.Client
	deviceID string
	bundleID string
}

func NewFindFiles(bridgeClient *bridge.Client, deviceID, bundleID string) *FindFilesTool {
	return &FindFilesTool{bridge: bridgeClient, deviceID: deviceID, bundleID: bundleID}
}

func (t *FindFilesTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"find_files",
		"Search for files matching a name pattern inside the app's sandbox. Uses find -name semantics. Returns a list of matching absolute paths.",
		FindFilesParams{},
	)
}

func (t *FindFilesTool) Run(ctx context.Context, params tool.ToolCall) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[FindFilesParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(fmt.Sprintf("invalid input: %v", err)), nil
	}

	if input.Pattern == "" {
		return tool.NewTextErrorResponse("pattern is required"), nil
	}

	basePath := input.BasePath
	if basePath == "" {
		basePath = "/data/data/" + t.bundleID
	}

	paths, err := t.bridge.FindFiles(t.deviceID, t.bundleID, input.Pattern, basePath)
	if err != nil {
		return tool.NewTextErrorResponse(fmt.Sprintf("find_files failed: %v", err)), nil
	}

	if len(paths) == 0 {
		return tool.NewTextResponse(fmt.Sprintf("No files matching %q found under %q.", input.Pattern, basePath)), nil
	}

	return tool.NewJSONResponse(paths), nil
}
