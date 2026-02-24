package crypto

type CryptoEventResponse struct {
	ID        string  `json:"id"`
	Operation string  `json:"operation"`
	Algorithm string  `json:"algorithm"`
	Input     *string `json:"input"`
	Output    *string `json:"output"`
	Key       *string `json:"key"`
	IV        *string `json:"iv"`
	Timestamp int64   `json:"timestamp"`
}

type CryptoEventsResponse struct {
	Events []CryptoEventResponse `json:"events"`
	Total  int                   `json:"total"`
}
