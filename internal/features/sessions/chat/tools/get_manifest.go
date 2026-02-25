package tools

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type GetManifestParams struct{}

type GetManifestTool struct {
	manager   *session.Manager
	sessionID string
}

func NewGetManifest(manager *session.Manager, sessionID string) *GetManifestTool {
	return &GetManifestTool{manager: manager, sessionID: sessionID}
}

func (t *GetManifestTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"get_manifest",
		"Get the full parsed AndroidManifest.xml — package name, version, permissions, and all components (activities, services, receivers, providers) with exported status, intent filters, launch modes, and permissions. Call at session start to map the app's attack surface.",
		GetManifestParams{},
	)
}

func (t *GetManifestTool) Run(ctx context.Context, params tool.ToolCall) (tool.ToolResponse, error) {
	raw, err := t.manager.AgentInvoke(t.sessionID, "manifest", "getManifest", []any{})
	if err != nil {
		return tool.NewTextErrorResponse(fmt.Sprintf("failed to get manifest: %v", err)), nil
	}

	var manifest any
	if err := json.Unmarshal(raw, &manifest); err != nil {
		return tool.NewTextErrorResponse("failed to parse manifest"), nil
	}

	return tool.NewJSONResponse(manifest), nil
}
