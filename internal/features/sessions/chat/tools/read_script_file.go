package tools

import (
	"context"
	"fmt"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/scripting"
)

type ReadScriptFileParams struct {
	Name string `json:"name" description:"Filename of the script to read (e.g. hook_crypto.ts)"`
}

type ReadScriptFileTool struct {
	files     *scripting.FileManager
	sessionID string
}

func NewReadScriptFile(files *scripting.FileManager, sessionID string) *ReadScriptFileTool {
	return &ReadScriptFileTool{files: files, sessionID: sessionID}
}

func (t *ReadScriptFileTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"read_script_file",
		"Read the contents of a saved Frida script file by filename.",
		ReadScriptFileParams{},
	)
}

func (t *ReadScriptFileTool) Run(ctx context.Context, params tool.ToolCall) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[ReadScriptFileParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(fmt.Sprintf("invalid input: %v", err)), nil
	}

	if input.Name == "" {
		return tool.NewTextErrorResponse("name is required"), nil
	}

	file, err := t.files.Get(t.sessionID, input.Name)
	if err != nil || file == nil {
		return tool.NewTextErrorResponse(fmt.Sprintf("script file %q not found", input.Name)), nil
	}

	return tool.NewTextResponse(file.Content), nil
}
