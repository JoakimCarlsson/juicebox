package logs

type LogcatEntryResponse struct {
	ID        string `json:"id"`
	Timestamp string `json:"timestamp"`
	PID       int    `json:"pid"`
	TID       int    `json:"tid"`
	Level     string `json:"level"`
	Tag       string `json:"tag"`
	Message   string `json:"message"`
}

type LogsResponse struct {
	Entries []LogcatEntryResponse `json:"entries"`
	Total   int                   `json:"total"`
}
