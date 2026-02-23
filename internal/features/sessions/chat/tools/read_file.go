package tools

import (
	"context"
	"fmt"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/bridge"
)

type ReadFileParams struct {
	Path string `json:"path" description:"Absolute path of the file to read."`
}

type ReadFileTool struct {
	bridge   *bridge.Client
	deviceID string
	bundleID string
}

func NewReadFile(bridgeClient *bridge.Client, deviceID, bundleID string) *ReadFileTool {
	return &ReadFileTool{bridge: bridgeClient, deviceID: deviceID, bundleID: bundleID}
}

func (t *ReadFileTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"read_file",
		"Read the contents of a file inside the app's sandbox. Returns text content for text files. Binary files return a base64-encoded payload with MIME type. Files larger than 5 MB are rejected.",
		ReadFileParams{},
	)
}

func (t *ReadFileTool) Run(ctx context.Context, params tool.ToolCall) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[ReadFileParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(fmt.Sprintf("invalid input: %v", err)), nil
	}

	if input.Path == "" {
		return tool.NewTextErrorResponse("path is required"), nil
	}

	content, err := t.bridge.ReadFile(t.deviceID, t.bundleID, input.Path)
	if err != nil {
		return tool.NewTextErrorResponse(fmt.Sprintf("read_file failed: %v", err)), nil
	}

	type result struct {
		Path     string `json:"path"`
		MimeType string `json:"mimeType"`
		Encoding string `json:"encoding"`
		Size     int64  `json:"size"`
		Content  string `json:"content"`
	}

	return tool.NewJSONResponse(result{
		Path:     content.Path,
		MimeType: content.MimeType,
		Encoding: content.Encoding,
		Size:     content.Size,
		Content:  content.Content,
	}), nil
}
