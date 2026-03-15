package tools

import (
	"context"
	"fmt"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/db"
)

type GetCryptoEventsParams struct {
	Algorithm string `json:"algorithm,omitempty" description:"Filter by algorithm substring (e.g. 'AES', 'HMAC', 'SHA-256')"`
	Operation string `json:"operation,omitempty" description:"Filter by operation type: encrypt, decrypt, mac, digest, key_derivation, key_generation"`
	Limit     int    `json:"limit,omitempty"     description:"Max results to return (default 50)"`
}

type GetCryptoEventsTool struct {
	db        *db.DB
	sessionID string
}

func NewGetCryptoEvents(
	database *db.DB,
	sessionID string,
) *GetCryptoEventsTool {
	return &GetCryptoEventsTool{db: database, sessionID: sessionID}
}

func (t *GetCryptoEventsTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"get_crypto_events",
		`Get recent cryptographic operation events captured by Frida on the target device.
Returns algorithm, operation type, key bytes, IV, input data, and output data in hex.
Use to investigate encryption, signing, hashing, and key derivation calls made by the app.
Correlate with HTTP traffic to identify signing keys, encryption schemes, and crypto misuse.`,
		GetCryptoEventsParams{},
	)
}

func (t *GetCryptoEventsTool) Run(
	ctx context.Context,
	params tool.ToolCall,
) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[GetCryptoEventsParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("invalid input: %v", err),
		), nil
	}

	rows, err := t.db.SearchCryptoEvents(
		t.sessionID,
		input.Algorithm,
		input.Operation,
		input.Limit,
	)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("search failed: %v", err),
		), nil
	}

	if len(rows) == 0 {
		return tool.NewTextResponse("No crypto events found."), nil
	}

	type result struct {
		ID        string  `json:"id"`
		Operation string  `json:"operation"`
		Algorithm string  `json:"algorithm"`
		Input     *string `json:"input,omitempty"`
		Output    *string `json:"output,omitempty"`
		Key       *string `json:"key,omitempty"`
		IV        *string `json:"iv,omitempty"`
		Timestamp int64   `json:"timestamp"`
	}

	results := make([]result, len(rows))
	for i, r := range rows {
		results[i] = result{
			ID:        r.ID,
			Operation: r.Operation,
			Algorithm: r.Algorithm,
			Input:     r.Input,
			Output:    r.Output,
			Key:       r.Key,
			IV:        r.IV,
			Timestamp: r.Timestamp,
		}
	}

	return tool.NewJSONResponse(results), nil
}
