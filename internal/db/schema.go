package db

import "fmt"

const schema = `
CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    device_id  TEXT NOT NULL,
    bundle_id  TEXT NOT NULL,
    pid        INTEGER NOT NULL DEFAULT 0,
    name       TEXT NOT NULL DEFAULT '',
    platform   TEXT NOT NULL DEFAULT 'android',
    started_at INTEGER NOT NULL,
    ended_at   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sessions_device ON sessions(device_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_device_bundle ON sessions(device_id, bundle_id, started_at DESC);

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

CREATE TABLE IF NOT EXISTS crashes (
    id                TEXT PRIMARY KEY,
    session_id        TEXT NOT NULL REFERENCES sessions(id),
    crash_type        TEXT NOT NULL,
    signal            TEXT,
    address           TEXT,
    registers         TEXT,
    backtrace         TEXT,
    java_stack_trace  TEXT,
    exception_class   TEXT,
    exception_message TEXT,
    timestamp         INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crashes_session ON crashes(session_id, timestamp);

CREATE TABLE IF NOT EXISTS crypto_events (
    id         TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    operation  TEXT NOT NULL,
    algorithm  TEXT NOT NULL DEFAULT '',
    input      TEXT,
    output     TEXT,
    key        TEXT,
    iv         TEXT,
    timestamp  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crypto_session ON crypto_events(session_id, timestamp);

CREATE TABLE IF NOT EXISTS clipboard_events (
    id           TEXT PRIMARY KEY,
    session_id   TEXT NOT NULL REFERENCES sessions(id),
    direction    TEXT NOT NULL,
    content      TEXT,
    mime_type    TEXT,
    caller_stack TEXT,
    timestamp    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clipboard_session ON clipboard_events(session_id, timestamp);

CREATE TABLE IF NOT EXISTS script_files (
    id         TEXT PRIMARY KEY,
    device_id  TEXT NOT NULL,
    name       TEXT NOT NULL,
    content    TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_script_files_name ON script_files(device_id, name);

CREATE TABLE IF NOT EXISTS script_runs (
    id             TEXT PRIMARY KEY,
    session_id     TEXT NOT NULL REFERENCES sessions(id),
    script_file_id TEXT REFERENCES script_files(id),
    output         TEXT,
    status         TEXT NOT NULL DEFAULT 'running',
    timestamp      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_script_runs_session ON script_runs(session_id, timestamp DESC);
`

func (d *DB) Migrate() error {
	if _, err := d.conn.Exec(schema); err != nil {
		return fmt.Errorf("db.Migrate: %w", err)
	}
	_, _ = d.conn.Exec(
		`ALTER TABLE sessions ADD COLUMN platform TEXT NOT NULL DEFAULT 'android'`,
	)
	_, _ = d.conn.Exec(
		`ALTER TABLE sessions ADD COLUMN capabilities TEXT NOT NULL DEFAULT '[]'`,
	)
	_, _ = d.conn.Exec(`DROP TABLE IF EXISTS scripts`)

	_, _ = d.conn.Exec(
		`ALTER TABLE script_files ADD COLUMN device_id TEXT NOT NULL DEFAULT ''`,
	)
	_, _ = d.conn.Exec(`
		UPDATE script_files SET device_id = (
			SELECT s.device_id FROM sessions s WHERE s.id = script_files.session_id
		) WHERE device_id = '' AND EXISTS (
			SELECT 1 FROM pragma_table_info('script_files') WHERE name = 'session_id'
		)
	`)

	return nil
}
