package sqlite

import (
	"database/sql"
	"fmt"
	"os"
	"sync"

	"github.com/joakimcarlsson/juicebox/internal/bridge"
	"github.com/joakimcarlsson/juicebox/internal/session"
	_ "modernc.org/sqlite"
)

type Service struct {
	mu     sync.Mutex
	pulled map[string]string
}

func NewService() *Service {
	return &Service{
		pulled: make(map[string]string),
	}
}

func (s *Service) pullKey(sessionID, dbPath string) string {
	return sessionID + ":" + dbPath
}

func (s *Service) EnsurePulled(
	sess *session.Session,
	sessionID, dbPath string,
) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := s.pullKey(sessionID, dbPath)
	if localPath, ok := s.pulled[key]; ok {
		if _, err := os.Stat(localPath); err == nil {
			return localPath, nil
		}
		delete(s.pulled, key)
	}

	localPath, err := sess.Setup.PullDatabase(
		sess.DeviceID,
		sess.BundleID,
		dbPath,
	)
	if err != nil {
		return "", fmt.Errorf("pull database: %w", err)
	}

	s.pulled[key] = localPath
	return localPath, nil
}

func (s *Service) OpenDB(
	sess *session.Session,
	sessionID, dbPath string,
) (*sql.DB, error) {
	localPath, err := s.EnsurePulled(sess, sessionID, dbPath)
	if err != nil {
		return nil, err
	}

	db, err := sql.Open("sqlite", localPath+"?mode=ro")
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	return db, nil
}

func (s *Service) GetTables(
	sess *session.Session,
	sessionID, dbPath string,
) ([]bridge.DatabaseTable, error) {
	db, err := s.OpenDB(sess, sessionID, dbPath)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.Query(
		"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
	)
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
		cols, err := s.getColumns(db, name)
		if err != nil {
			cols = nil
		}
		tables = append(tables, bridge.DatabaseTable{Name: name, Columns: cols})
	}

	return tables, nil
}

func (s *Service) getColumns(
	db *sql.DB,
	tableName string,
) ([]bridge.DatabaseColumn, error) {
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

func (s *Service) ExecQuery(
	sess *session.Session,
	sessionID, dbPath, sqlStr string,
) (*QueryResponse, error) {
	db, err := s.OpenDB(sess, sessionID, dbPath)
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
