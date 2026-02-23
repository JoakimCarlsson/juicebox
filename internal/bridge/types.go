package bridge

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

type AttachResponse struct {
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
