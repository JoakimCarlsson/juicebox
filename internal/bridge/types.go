package bridge

type Device struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
}

type App struct {
	Identifier string `json:"identifier"`
	Name       string `json:"name"`
	PID        int    `json:"pid"`
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
