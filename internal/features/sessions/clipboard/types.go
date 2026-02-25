package clipboard

type ClipboardEventResponse struct {
	ID          string  `json:"id"`
	Direction   string  `json:"direction"`
	Content     *string `json:"content"`
	MimeType    *string `json:"mimeType"`
	CallerStack *string `json:"callerStack"`
	Timestamp   int64   `json:"timestamp"`
}

type ClipboardEventsResponse struct {
	Events []ClipboardEventResponse `json:"events"`
	Total  int                      `json:"total"`
}
