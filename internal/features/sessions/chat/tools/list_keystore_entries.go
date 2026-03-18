package tools

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type ListKeystoreEntriesParams struct{}

type ListKeystoreEntriesTool struct {
	manager   *session.Manager
	sessionID string
}

func NewListKeystoreEntries(
	manager *session.Manager,
	sessionID string,
) *ListKeystoreEntriesTool {
	return &ListKeystoreEntriesTool{manager: manager, sessionID: sessionID}
}

func (t *ListKeystoreEntriesTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"list_keystore_entries",
		`Enumerate keys stored in the Android Keystore for the target app on the device.
Returns alias, key type (AES/RSA/EC), key size, creation date, usage purposes, authentication requirements, and hardware backing status.
Use to assess key management security: flag software-backed keys, keys without auth, ECB mode, or keys used for both signing and encryption.`,
		ListKeystoreEntriesParams{},
	)
}

func (t *ListKeystoreEntriesTool) Run(
	ctx context.Context,
	params tool.ToolCall,
) (tool.ToolResponse, error) {
	raw, err := t.manager.AgentInvoke(
		t.sessionID,
		"keystore",
		"enumerate",
		[]any{},
	)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("failed to enumerate keystore: %v", err),
		), nil
	}

	var entries []json.RawMessage
	if err := json.Unmarshal(raw, &entries); err != nil {
		return tool.NewTextErrorResponse(
			"failed to parse keystore entries",
		), nil
	}

	if len(entries) == 0 {
		return tool.NewTextResponse("No keystore entries found."), nil
	}

	return tool.NewJSONResponse(json.RawMessage(raw)), nil
}
