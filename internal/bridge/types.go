package bridge

import "encoding/json"

type Device struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Type     string `json:"type"`
	Platform string `json:"platform"`
}

type App struct {
	Identifier string `json:"identifier"`
	Name       string `json:"name"`
	PID        int    `json:"pid"`
}

type Process struct {
	PID  int    `json:"pid"`
	Name string `json:"name"`
}

type AppIcon struct {
	Format string `json:"format"`
	Data   string `json:"data"`
}

type EvasionConfig struct {
	FridaBypass    *bool `json:"frida_bypass,omitempty"`
	RootBypass     *bool `json:"root_bypass,omitempty"`
	EmulatorBypass *bool `json:"emulator_bypass,omitempty"`
	SSLBypass      *bool `json:"ssl_bypass,omitempty"`
	CrashHandler   *bool `json:"crash_handler,omitempty"`
}

type AttachResponse struct {
	SessionID string `json:"sessionId"`
	PID       int    `json:"pid"`
}

type ConnectDeviceResponse struct {
	DeviceID string `json:"deviceId"`
	Platform string `json:"platform"`
}

type SpawnAppResponse struct {
	SessionID string `json:"sessionId"`
	PID       int    `json:"pid"`
}

type DeviceInfo struct {
	Name     string `json:"name"`
	ID       string `json:"id"`
	Type     string `json:"type"`
	OS       any    `json:"os"`
	Platform string `json:"platform"`
	Arch     string `json:"arch"`
	Access   string `json:"access"`
}

type FileEntry struct {
	Name        string `json:"name"`
	Path        string `json:"path"`
	Type        string `json:"type"`
	Size        int64  `json:"size"`
	Permissions string `json:"permissions"`
	ModifiedAt  string `json:"modifiedAt"`
}

type FileContent struct {
	Path     string `json:"path"`
	Content  string `json:"content"`
	Encoding string `json:"encoding"`
	MimeType string `json:"mimeType"`
	Size     int64  `json:"size"`
}

type PullDatabaseResponse struct {
	LocalPath string `json:"localPath"`
}

type DatabaseTable struct {
	Name    string           `json:"name"`
	Columns []DatabaseColumn `json:"columns"`
}

type DatabaseColumn struct {
	Name    string `json:"name"`
	Type    string `json:"type"`
	NotNull bool   `json:"notNull"`
	PK      bool   `json:"pk"`
}

type CompileResult struct {
	Success bool `json:"success"`
}

type RunScriptResponse struct {
	Mode              string            `json:"mode"`
	Name              string            `json:"name,omitempty"`
	Messages          []json.RawMessage `json:"messages"`
	MessagesCollected int               `json:"messagesCollected,omitempty"`
}

type GetScriptOutputResponse struct {
	Name          string            `json:"name"`
	Running       bool              `json:"running"`
	TotalMessages int               `json:"totalMessages"`
	Since         int               `json:"since"`
	Messages      []json.RawMessage `json:"messages"`
}

type StopScriptResponse struct {
	Name          string            `json:"name"`
	TotalMessages int               `json:"totalMessages"`
	Messages      []json.RawMessage `json:"messages"`
}
