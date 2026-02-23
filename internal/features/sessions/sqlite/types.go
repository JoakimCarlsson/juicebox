package sqlite

import "github.com/joakimcarlsson/juicebox/internal/bridge"

type TablesResponse struct {
	DbPath string                 `json:"dbPath"`
	Tables []bridge.DatabaseTable `json:"tables"`
}

type QueryRequest struct {
	DbPath   string `json:"dbPath"`
	SQL      string `json:"sql"`
	ReadOnly *bool  `json:"readOnly,omitempty"`
}

type QueryResponse struct {
	Columns      []string `json:"columns"`
	Rows         [][]any  `json:"rows"`
	RowCount     int      `json:"rowCount"`
	RowsAffected int64    `json:"rowsAffected,omitempty"`
}
