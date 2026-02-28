package chat

type chatRequest struct {
	Message  string `json:"message"`
	BundleID string `json:"bundleId"`
}

type sseContentEvent struct {
	Delta string `json:"delta"`
}

type sseToolStartEvent struct {
	Name string `json:"name"`
	ID   string `json:"id"`
}

type sseToolEndEvent struct {
	Name   string `json:"name"`
	ID     string `json:"id"`
	Result string `json:"result"`
}

type sseDoneEvent struct {
	InputTokens  int64 `json:"input_tokens"`
	OutputTokens int64 `json:"output_tokens"`
}

type sseErrorEvent struct {
	Message string `json:"message"`
}

type sseEditResultEvent struct {
	Success bool   `json:"success,omitempty"`
	Error   string `json:"error,omitempty"`
}

type historyPart struct {
	Type    string `json:"type"`
	Content string `json:"content,omitempty"`
	ID      string `json:"id,omitempty"`
	Name    string `json:"name,omitempty"`
	Status  string `json:"status,omitempty"`
	Result  string `json:"result,omitempty"`
}

type historyMsg struct {
	Role    string        `json:"role"`
	Content string        `json:"content"`
	Parts   []historyPart `json:"parts,omitempty"`
}
