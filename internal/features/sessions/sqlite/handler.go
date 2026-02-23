package sqlite

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"

	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/bridge"
	"github.com/joakimcarlsson/juicebox/internal/session"
	_ "modernc.org/sqlite"
)

type Handler struct {
	bridge  *bridge.Client
	manager *session.Manager
	mu      sync.Mutex
	pulled  map[string]string
}

func NewHandler(bridgeClient *bridge.Client, manager *session.Manager) *Handler {
	return &Handler{
		bridge:  bridgeClient,
		manager: manager,
		pulled:  make(map[string]string),
	}
}

func (h *Handler) pullKey(sessionID, dbPath string) string {
	return sessionID + ":" + dbPath
}

func (h *Handler) ensurePulled(sess *session.Session, sessionID, dbPath string) (string, error) {
	h.mu.Lock()
	defer h.mu.Unlock()

	key := h.pullKey(sessionID, dbPath)
	if localPath, ok := h.pulled[key]; ok {
		if _, err := os.Stat(localPath); err == nil {
			return localPath, nil
		}
		delete(h.pulled, key)
	}

	localPath, err := h.bridge.PullDatabase(sess.DeviceID, sess.BundleID, dbPath)
	if err != nil {
		return "", fmt.Errorf("pull database: %w", err)
	}

	h.pulled[key] = localPath
	return localPath, nil
}

func (h *Handler) OpenDB(sess *session.Session, sessionID, dbPath string) (*sql.DB, error) {
	localPath, err := h.ensurePulled(sess, sessionID, dbPath)
	if err != nil {
		return nil, err
	}

	db, err := sql.Open("sqlite", localPath+"?mode=ro")
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	return db, nil
}

func (h *Handler) GetTables(sess *session.Session, sessionID, dbPath string) ([]bridge.DatabaseTable, error) {
	db, err := h.OpenDB(sess, sessionID, dbPath)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
	if err != nil {
		return nil, fmt.Errorf("query tables: %w", err)
	}
	defer rows.Close()

	var tables []bridge.DatabaseTable
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			continue
		}
		cols, err := h.getColumns(db, name)
		if err != nil {
			cols = nil
		}
		tables = append(tables, bridge.DatabaseTable{Name: name, Columns: cols})
	}

	return tables, nil
}

func (h *Handler) getColumns(db *sql.DB, tableName string) ([]bridge.DatabaseColumn, error) {
	rows, err := db.Query(fmt.Sprintf("PRAGMA table_info(%q)", tableName))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var columns []bridge.DatabaseColumn
	for rows.Next() {
		var cid int
		var name, colType string
		var notNull, pk int
		var dfltValue *string
		if err := rows.Scan(&cid, &name, &colType, &notNull, &dfltValue, &pk); err != nil {
			continue
		}
		columns = append(columns, bridge.DatabaseColumn{
			Name:    name,
			Type:    colType,
			NotNull: notNull != 0,
			PK:      pk != 0,
		})
	}

	return columns, nil
}

func (h *Handler) ExecQuery(sess *session.Session, sessionID, dbPath, sqlStr string) (*QueryResponse, error) {
	db, err := h.OpenDB(sess, sessionID, dbPath)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query(sqlStr)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return nil, fmt.Errorf("columns: %w", err)
	}

	var resultRows [][]any
	for rows.Next() {
		values := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range values {
			ptrs[i] = &values[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			continue
		}
		row := make([]any, len(cols))
		for i, v := range values {
			switch val := v.(type) {
			case []byte:
				row[i] = string(val)
			default:
				row[i] = val
			}
		}
		resultRows = append(resultRows, row)
	}

	if resultRows == nil {
		resultRows = [][]any{}
	}

	return &QueryResponse{
		Columns:  cols,
		Rows:     resultRows,
		RowCount: len(resultRows),
	}, nil
}

func (h *Handler) Tables(c *router.Context) {
	sessionID := c.Param("sessionId")
	dbPath := c.QueryDefault("dbPath", "")

	if dbPath == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "dbPath is required"})
		return
	}

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		c.JSON(http.StatusNotFound, map[string]string{"error": "session not found"})
		return
	}

	tables, err := h.GetTables(sess, sessionID, dbPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, TablesResponse{DbPath: dbPath, Tables: tables})
}

func (h *Handler) Query(c *router.Context) {
	sessionID := c.Param("sessionId")

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		c.JSON(http.StatusNotFound, map[string]string{"error": "session not found"})
		return
	}

	var req QueryRequest
	if err := json.NewDecoder(c.Request.Body).Decode(&req); err != nil {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if req.DbPath == "" || req.SQL == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "dbPath and sql are required"})
		return
	}

	trimmed := strings.TrimSpace(strings.ToUpper(req.SQL))
	isWrite := strings.HasPrefix(trimmed, "INSERT") ||
		strings.HasPrefix(trimmed, "UPDATE") ||
		strings.HasPrefix(trimmed, "DELETE") ||
		strings.HasPrefix(trimmed, "DROP") ||
		strings.HasPrefix(trimmed, "ALTER") ||
		strings.HasPrefix(trimmed, "CREATE")

	if isWrite {
		readOnly := req.ReadOnly == nil || *req.ReadOnly
		if readOnly {
			c.JSON(http.StatusBadRequest, map[string]string{"error": "write operations require readOnly: false"})
			return
		}
		resp, err := h.execWrite(sess, sessionID, req.DbPath, req.SQL)
		if err != nil {
			c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, resp)
		return
	}

	resp, err := h.ExecQuery(sess, sessionID, req.DbPath, req.SQL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

func (h *Handler) execWrite(sess *session.Session, sessionID, dbPath, sqlStr string) (*QueryResponse, error) {
	localPath, err := h.ensurePulled(sess, sessionID, dbPath)
	if err != nil {
		return nil, err
	}

	db, err := sql.Open("sqlite", localPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite for write: %w", err)
	}
	defer db.Close()

	result, err := db.Exec(sqlStr)
	if err != nil {
		return nil, fmt.Errorf("exec: %w", err)
	}

	affected, _ := result.RowsAffected()

	return &QueryResponse{
		Columns:      []string{},
		Rows:         [][]any{},
		RowCount:     0,
		RowsAffected: affected,
	}, nil
}

func (h *Handler) Export(c *router.Context) {
	sessionID := c.Param("sessionId")
	dbPath := c.QueryDefault("dbPath", "")
	sqlStr := c.QueryDefault("sql", "")

	if dbPath == "" || sqlStr == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "dbPath and sql are required"})
		return
	}

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		c.JSON(http.StatusNotFound, map[string]string{"error": "session not found"})
		return
	}

	resp, err := h.ExecQuery(sess, sessionID, dbPath, sqlStr)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	c.Writer.Header().Set("Content-Type", "text/csv")
	c.Writer.Header().Set("Content-Disposition", `attachment; filename="export.csv"`)
	c.Writer.WriteHeader(http.StatusOK)

	w := csv.NewWriter(c.Writer)
	w.Write(resp.Columns) //nolint:errcheck

	for _, row := range resp.Rows {
		record := make([]string, len(row))
		for i, v := range row {
			record[i] = fmt.Sprintf("%v", v)
		}
		w.Write(record) //nolint:errcheck
	}

	w.Flush()
}
