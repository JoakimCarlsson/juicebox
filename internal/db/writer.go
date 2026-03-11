package db

import "log/slog"

type writeOp struct {
	httpMessage    *HttpMessageRow
	logcatEntry    *LogcatEntryRow
	crashRow       *CrashRow
	cryptoEvent    *CryptoEventRow
	clipboardEvent *ClipboardEventRow
	flutterChannel *FlutterChannelRow
}

type AsyncWriter struct {
	db   *DB
	ch   chan writeOp
	done chan struct{}
}

func NewAsyncWriter(db *DB, bufferSize int) *AsyncWriter {
	w := &AsyncWriter{
		db:   db,
		ch:   make(chan writeOp, bufferSize),
		done: make(chan struct{}),
	}
	go w.loop()
	return w
}

func (w *AsyncWriter) WriteHttpMessage(m *HttpMessageRow) {
	select {
	case w.ch <- writeOp{httpMessage: m}:
	default:
		slog.Warn("db write buffer full, dropping http message", "id", m.ID)
	}
}

func (w *AsyncWriter) WriteLogcatEntry(e *LogcatEntryRow) {
	select {
	case w.ch <- writeOp{logcatEntry: e}:
	default:
		slog.Warn("db write buffer full, dropping logcat entry", "id", e.ID)
	}
}

func (w *AsyncWriter) WriteCrash(c *CrashRow) {
	select {
	case w.ch <- writeOp{crashRow: c}:
	default:
		slog.Warn("db write buffer full, dropping crash", "id", c.ID)
	}
}

func (w *AsyncWriter) WriteCryptoEvent(c *CryptoEventRow) {
	select {
	case w.ch <- writeOp{cryptoEvent: c}:
	default:
		slog.Warn("db write buffer full, dropping crypto event", "id", c.ID)
	}
}

func (w *AsyncWriter) WriteClipboardEvent(c *ClipboardEventRow) {
	select {
	case w.ch <- writeOp{clipboardEvent: c}:
	default:
		slog.Warn("db write buffer full, dropping clipboard event", "id", c.ID)
	}
}

func (w *AsyncWriter) WriteFlutterChannel(r *FlutterChannelRow) {
	select {
	case w.ch <- writeOp{flutterChannel: r}:
	default:
		slog.Warn(
			"db write buffer full, dropping flutter channel event",
			"id",
			r.ID,
		)
	}
}

func (w *AsyncWriter) loop() {
	defer close(w.done)
	for op := range w.ch {
		if op.httpMessage != nil {
			if err := w.db.InsertHttpMessage(op.httpMessage); err != nil {
				slog.Error("async write http message", "error", err)
			}
		}
		if op.logcatEntry != nil {
			if err := w.db.InsertLogcatEntry(op.logcatEntry); err != nil {
				slog.Error("async write logcat entry", "error", err)
			}
		}
		if op.crashRow != nil {
			if err := w.db.InsertCrash(op.crashRow); err != nil {
				slog.Error("async write crash", "error", err)
			}
		}
		if op.cryptoEvent != nil {
			if err := w.db.InsertCryptoEvent(op.cryptoEvent); err != nil {
				slog.Error("async write crypto event", "error", err)
			}
		}
		if op.clipboardEvent != nil {
			if err := w.db.InsertClipboardEvent(op.clipboardEvent); err != nil {
				slog.Error("async write clipboard event", "error", err)
			}
		}
		if op.flutterChannel != nil {
			if err := w.db.InsertFlutterChannel(op.flutterChannel); err != nil {
				slog.Error("async write flutter channel event", "error", err)
			}
		}
	}
}

func (w *AsyncWriter) Close() {
	close(w.ch)
	<-w.done
}
