package tools

import (
	"context"
	"fmt"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type QueryResult struct {
	Columns  []string `json:"columns"`
	Rows     [][]any  `json:"rows"`
	RowCount int      `json:"rowCount"`
}

type SqliteQueryParams struct {
	DbPath string `json:"db_path" description:"Absolute path to the SQLite database file on the device."`
	SQL    string `json:"sql" description:"SQL query to execute (SELECT only)."`
}

type SqliteQueryTool struct {
	execFn    func(sess *session.Session, sessionID, dbPath, sql string) (*QueryResult, error)
	manager   *session.Manager
	sessionID string
}

func NewSqliteQuery(execFn func(sess *session.Session, sessionID, dbPath, sql string) (*QueryResult, error), manager *session.Manager, sessionID string) *SqliteQueryTool {
	return &SqliteQueryTool{execFn: execFn, manager: manager, sessionID: sessionID}
}

func (t *SqliteQueryTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"sqlite_query",
		"Execute a read-only SQL query against a SQLite database in the app's sandbox. The database is pulled from the device automatically. Returns columns and rows.",
		SqliteQueryParams{},
	)
}

func (t *SqliteQueryTool) Run(ctx context.Context, params tool.ToolCall) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[SqliteQueryParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(fmt.Sprintf("invalid input: %v", err)), nil
	}

	if input.DbPath == "" || input.SQL == "" {
		return tool.NewTextErrorResponse("db_path and sql are required"), nil
	}

	sess := t.manager.GetSession(t.sessionID)
	if sess == nil {
		return tool.NewTextErrorResponse("session not found"), nil
	}

	result, err := t.execFn(sess, t.sessionID, input.DbPath, input.SQL)
	if err != nil {
		return tool.NewTextErrorResponse(fmt.Sprintf("sqlite_query failed: %v", err)), nil
	}

	return tool.NewJSONResponse(result), nil
}
