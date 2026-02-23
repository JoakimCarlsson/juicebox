package list

type SessionItem struct {
	ID          string `json:"id"`
	DeviceID    string `json:"deviceId"`
	BundleID    string `json:"bundleId"`
	PID         int    `json:"pid"`
	Name        string `json:"name"`
	Platform    string `json:"platform"`
	StartedAt   int64  `json:"startedAt"`
	EndedAt     *int64 `json:"endedAt"`
	HttpCount   int    `json:"httpCount"`
	LogcatCount int    `json:"logcatCount"`
}

type ListResponse struct {
	Sessions []SessionItem `json:"sessions"`
	Total    int           `json:"total"`
}
