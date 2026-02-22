package devicehub

import "encoding/json"

type Envelope struct {
	Type      string          `json:"type"`
	SessionID string          `json:"sessionId,omitempty"`
	Payload   json.RawMessage `json:"payload,omitempty"`
}

func Marshal(msgType, sessionID string, payload any) ([]byte, error) {
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	env := Envelope{
		Type:      msgType,
		SessionID: sessionID,
		Payload:   payloadBytes,
	}
	data, err := json.Marshal(env)
	if err != nil {
		return nil, err
	}
	return append(data, '\n'), nil
}
