package findings

type createRequest struct {
	Title       string `json:"title"`
	Severity    string `json:"severity"`
	Description string `json:"description"`
}

type updateRequest struct {
	Title       *string `json:"title"`
	Severity    *string `json:"severity"`
	Description *string `json:"description"`
}
