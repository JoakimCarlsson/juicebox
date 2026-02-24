package attach

import "github.com/joakimcarlsson/juicebox/internal/bridge"

type AttachRequest struct {
	DeviceID   string `json:"deviceId"`
	Identifier string `json:"identifier"`
}

type AttachRequestBody struct {
	Evasion *bridge.EvasionConfig `json:"evasion,omitempty"`
}

type AttachResponseBody struct {
	SessionID    string   `json:"sessionId"`
	PID          int      `json:"pid"`
	Capabilities []string `json:"capabilities"`
}
