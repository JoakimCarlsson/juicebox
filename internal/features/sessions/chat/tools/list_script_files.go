package tools

import (
	"context"
	"fmt"

	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/scripting"
)

type ListScriptFilesParams struct{}

type ListScriptFilesTool struct {
	files    *scripting.FileManager
	deviceID string
}

func NewListScriptFiles(
	files *scripting.FileManager,
	deviceID string,
) *ListScriptFilesTool {
	return &ListScriptFilesTool{files: files, deviceID: deviceID}
}

func (t *ListScriptFilesTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"list_script_files",
		"List all saved Frida script files for this device. Returns filenames (including folder paths like bundleId/script.ts) and last updated timestamps.",
		ListScriptFilesParams{},
	)
}

func (t *ListScriptFilesTool) Run(
	ctx context.Context,
	params tool.ToolCall,
) (tool.ToolResponse, error) {
	files, err := t.files.List(t.deviceID)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("failed to list script files: %v", err),
		), nil
	}

	if len(files) == 0 {
		return tool.NewTextResponse(
			"No script files found for this device.",
		), nil
	}

	type fileInfo struct {
		Name      string `json:"name"`
		UpdatedAt int64  `json:"updatedAt"`
	}

	result := make([]fileInfo, 0, len(files))
	for _, f := range files {
		result = append(result, fileInfo{Name: f.Name, UpdatedAt: f.UpdatedAt})
	}

	return tool.NewJSONResponse(result), nil
}
