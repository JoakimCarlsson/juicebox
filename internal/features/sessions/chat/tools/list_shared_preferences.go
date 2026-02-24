package tools

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type ListSharedPreferencesParams struct{}

type ListSharedPreferencesTool struct {
	manager   *session.Manager
	sessionID string
}

func NewListSharedPreferences(manager *session.Manager, sessionID string) *ListSharedPreferencesTool {
	return &ListSharedPreferencesTool{manager: manager, sessionID: sessionID}
}

func (t *ListSharedPreferencesTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"list_shared_preferences",
		"Enumerate all SharedPreferences files for the target app, including EncryptedSharedPreferences. Returns file names, whether they are encrypted (Jetpack Security / Tink), and all key-value pairs with types. For encrypted prefs, values are returned decrypted. Correlate encrypted prefs with list_keystore_entries to check whether the master key (typically _androidx_security_master_key_) is hardware-backed.",
		ListSharedPreferencesParams{},
	)
}

func (t *ListSharedPreferencesTool) Run(ctx context.Context, params tool.ToolCall) (tool.ToolResponse, error) {
	raw, err := t.manager.AgentInvoke(t.sessionID, "sharedprefs", "enumerate", []any{})
	if err != nil {
		return tool.NewTextErrorResponse(fmt.Sprintf("failed to enumerate shared preferences: %v", err)), nil
	}

	var files []json.RawMessage
	if err := json.Unmarshal(raw, &files); err != nil {
		return tool.NewTextErrorResponse("failed to parse shared preferences"), nil
	}

	if len(files) == 0 {
		return tool.NewTextResponse("No SharedPreferences files found."), nil
	}

	return tool.NewJSONResponse(json.RawMessage(raw)), nil
}
