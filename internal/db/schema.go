package db

import "fmt"

const schema = `
CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    device_id  TEXT NOT NULL,
    bundle_id  TEXT NOT NULL,
    pid        INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER NOT NULL,
    ended_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sessions_device ON sessions(device_id, started_at DESC);

CREATE TABLE IF NOT EXISTS http_messages (
    id                     TEXT PRIMARY KEY,
    session_id             TEXT NOT NULL REFERENCES sessions(id),
    method                 TEXT NOT NULL,
    url                    TEXT NOT NULL,
    request_headers        TEXT,
    request_body           TEXT,
    request_body_encoding  TEXT,
    request_body_size      INTEGER NOT NULL DEFAULT 0,
    status_code            INTEGER NOT NULL DEFAULT 0,
    response_headers       TEXT,
    response_body          TEXT,
    response_body_encoding TEXT,
    response_body_size     INTEGER NOT NULL DEFAULT 0,
    duration               INTEGER NOT NULL DEFAULT 0,
    timestamp              INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_http_msg_session ON http_messages(session_id, timestamp);

CREATE TABLE IF NOT EXISTS logcat_entries (
    id         TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    timestamp  TEXT NOT NULL,
    pid        INTEGER NOT NULL,
    tid        INTEGER NOT NULL,
    level      TEXT NOT NULL,
    tag        TEXT NOT NULL DEFAULT '',
    message    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_logcat_session ON logcat_entries(session_id);

CREATE TABLE IF NOT EXISTS hook_events (
    id         TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    type       TEXT NOT NULL,
    payload    TEXT,
    timestamp  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hook_session ON hook_events(session_id);
`

func (d *DB) Migrate() error {
	if _, err := d.Conn.Exec(schema); err != nil {
		return fmt.Errorf("db.Migrate: %w", err)
	}
	return nil
}
