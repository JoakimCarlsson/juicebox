package sqlite

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/joakimcarlsson/go-router/router/v2"
	"github.com/joakimcarlsson/juicebox/internal/response"
	"github.com/joakimcarlsson/juicebox/internal/session"
	_ "modernc.org/sqlite"
)

type Handler struct {
	manager *session.Manager
	service *Service
}

func NewHandler(manager *session.Manager, service *Service) *Handler {
	return &Handler{
		manager: manager,
		service: service,
	}
}

func (h *Handler) Tables(c *router.Context) {
	sessionID := c.Param("sessionId")
	dbPath := c.QueryDefault("dbPath", "")

	if dbPath == "" {
		response.Error(c, http.StatusBadRequest, "dbPath is required")
		return
	}

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		response.Error(c, http.StatusNotFound, "session not found")
		return
	}

	dc := h.manager.GetDeviceConnection(sess.DeviceID)
	if dc == nil {
		response.Error(c, http.StatusNotFound, "device not connected")
		return
	}

	tables, err := h.service.GetTables(
		dc.Setup,
		sess.DeviceID,
		sess.BundleID,
		sessionID,
		dbPath,
	)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.JSON(http.StatusOK, TablesResponse{DbPath: dbPath, Tables: tables})
}

func (h *Handler) Query(c *router.Context) {
	sessionID := c.Param("sessionId")

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		response.Error(c, http.StatusNotFound, "session not found")
		return
	}

	dc := h.manager.GetDeviceConnection(sess.DeviceID)
	if dc == nil {
		response.Error(c, http.StatusNotFound, "device not connected")
		return
	}

	var req QueryRequest
	if err := json.NewDecoder(c.Request.Body).Decode(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.DbPath == "" || req.SQL == "" {
		response.Error(c, http.StatusBadRequest, "dbPath and sql are required")
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
			response.Error(
				c,
				http.StatusBadRequest,
				"write operations require readOnly: false",
			)
			return
		}
		resp, err := h.execWrite(
			dc.Setup,
			sess.DeviceID,
			sess.BundleID,
			sessionID,
			req.DbPath,
			req.SQL,
		)
		if err != nil {
			response.Error(c, http.StatusInternalServerError, err.Error())
			return
		}
		c.JSON(http.StatusOK, resp)
		return
	}

	resp, err := h.service.ExecQuery(
		dc.Setup,
		sess.DeviceID,
		sess.BundleID,
		sessionID,
		req.DbPath,
		req.SQL,
	)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.JSON(http.StatusOK, resp)
}

func (h *Handler) execWrite(
	setup session.DeviceSetup,
	deviceID, bundleID, sessionID, dbPath, sqlStr string,
) (*QueryResponse, error) {
	localPath, err := h.service.EnsurePulled(
		setup,
		deviceID,
		bundleID,
		sessionID,
		dbPath,
	)
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
		response.Error(c, http.StatusBadRequest, "dbPath and sql are required")
		return
	}

	sess := h.manager.GetSession(sessionID)
	if sess == nil {
		response.Error(c, http.StatusNotFound, "session not found")
		return
	}

	dc := h.manager.GetDeviceConnection(sess.DeviceID)
	if dc == nil {
		response.Error(c, http.StatusNotFound, "device not connected")
		return
	}

	resp, err := h.service.ExecQuery(
		dc.Setup,
		sess.DeviceID,
		sess.BundleID,
		sessionID,
		dbPath,
		sqlStr,
	)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.Writer.Header().Set("Content-Type", "text/csv")
	c.Writer.Header().
		Set("Content-Disposition", `attachment; filename="export.csv"`)
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
