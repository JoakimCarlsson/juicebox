package tools

import (
	"context"
	"fmt"

	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/db"
)

type ListScriptFilesParams struct{}

type ListScriptFilesTool struct {
	db        *db.DB
	sessionID string
}

func NewListScriptFiles(database *db.DB, sessionID string) *ListScriptFilesTool {
	return &ListScriptFilesTool{db: database, sessionID: sessionID}
}

func (t *ListScriptFilesTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"list_script_files",
		"List all saved Frida script files for this session. Returns filenames and last updated timestamps.",
		ListScriptFilesParams{},
	)
}

func (t *ListScriptFilesTool) Run(ctx context.Context, params tool.ToolCall) (tool.ToolResponse, error) {
	files, err := t.db.GetScriptFiles(t.sessionID)
	if err != nil {
		return tool.NewTextErrorResponse(fmt.Sprintf("failed to list script files: %v", err)), nil
	}

	if len(files) == 0 {
		return tool.NewTextResponse("No script files found for this session."), nil
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
