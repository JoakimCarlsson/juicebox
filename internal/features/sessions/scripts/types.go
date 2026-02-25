package scripts

import "encoding/json"

type upsertRequest struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

type runRequest struct {
	Name string `json:"name"`
}

type listItem struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Content   string `json:"content"`
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
}

type listRunItem struct {
	ID           string            `json:"id"`
	ScriptFileID string            `json:"scriptFileId"`
	Output       []json.RawMessage `json:"output"`
	Status       string            `json:"status"`
	Timestamp    int64             `json:"timestamp"`
}
