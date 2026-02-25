package tools

import (
	"context"
	"fmt"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type LsParams struct {
	Path string `json:"path" description:"Directory path to list. Defaults to the app's data directory if omitted."`
}

type LsTool struct {
	setup    session.DeviceSetup
	deviceID string
	bundleID string
}

func NewLs(setup session.DeviceSetup, deviceID, bundleID string) *LsTool {
	return &LsTool{setup: setup, deviceID: deviceID, bundleID: bundleID}
}

func (t *LsTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"ls",
		"List files and directories at a given path inside the app's sandbox. Returns name, type (file/dir/symlink), size, permissions, and modification timestamp for each entry.",
		LsParams{},
	)
}

func (t *LsTool) Run(
	ctx context.Context,
	params tool.ToolCall,
) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[LsParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("invalid input: %v", err),
		), nil
	}

	path := input.Path
	if path == "" {
		path = "/data/data/" + t.bundleID
	}

	entries, err := t.setup.ListFiles(t.deviceID, t.bundleID, path)
	if err != nil {
		return tool.NewTextErrorResponse(fmt.Sprintf("ls failed: %v", err)), nil
	}

	if len(entries) == 0 {
		return tool.NewTextResponse(
			fmt.Sprintf("Directory %q is empty or not accessible.", path),
		), nil
	}

	type entry struct {
		Name        string `json:"name"`
		Path        string `json:"path"`
		Type        string `json:"type"`
		Size        int64  `json:"size"`
		Permissions string `json:"permissions"`
		ModifiedAt  string `json:"modifiedAt"`
	}

	results := make([]entry, len(entries))
	for i, e := range entries {
		results[i] = entry{
			Name:        e.Name,
			Path:        e.Path,
			Type:        e.Type,
			Size:        e.Size,
			Permissions: e.Permissions,
			ModifiedAt:  e.ModifiedAt,
		}
	}

	return tool.NewJSONResponse(results), nil
}
