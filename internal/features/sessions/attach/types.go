package attach

type AttachRequest struct {
	DeviceID   string `json:"deviceId"`
	Identifier string `json:"identifier"`
}

type AttachResponseBody struct {
	SessionID string `json:"sessionId"`
	PID       int    `json:"pid"`
}
