package otel

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strings"

	"github.com/joakimcarlsson/juicebox/internal/devicehub"
	"go.opentelemetry.io/contrib/bridges/otelslog"
	"go.opentelemetry.io/otel/trace"
)

func SetupLogger(serviceName, level, format string, hubManager *devicehub.Manager) {
	var baseHandler slog.Handler

	opts := &slog.HandlerOptions{
		Level: parseLevel(level),
	}

	if strings.ToLower(format) == "text" {
		baseHandler = slog.NewTextHandler(os.Stdout, opts)
	} else {
		baseHandler = slog.NewJSONHandler(os.Stdout, opts)
	}

	otelHandler := otelslog.NewHandler(serviceName)
	handlers := []slog.Handler{
		&traceContextHandler{handler: baseHandler},
		otelHandler,
	}
	if hubManager != nil {
		handlers = append(handlers, &hubHandler{manager: hubManager})
	}

	slog.SetDefault(slog.New(&multiHandler{handlers: handlers}))
}

func parseLevel(level string) slog.Level {
	switch strings.ToLower(level) {
	case "debug":
		return slog.LevelDebug
	case "info":
		return slog.LevelInfo
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

type traceContextHandler struct {
	handler slog.Handler
}

func (h *traceContextHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return h.handler.Enabled(ctx, level)
}

func (h *traceContextHandler) Handle(ctx context.Context, r slog.Record) error {
	span := trace.SpanFromContext(ctx)
	if span.SpanContext().IsValid() {
		r.AddAttrs(
			slog.String("trace_id", span.SpanContext().TraceID().String()),
			slog.String("span_id", span.SpanContext().SpanID().String()),
		)
	}
	return h.handler.Handle(ctx, r)
}

func (h *traceContextHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &traceContextHandler{handler: h.handler.WithAttrs(attrs)}
}

func (h *traceContextHandler) WithGroup(name string) slog.Handler {
	return &traceContextHandler{handler: h.handler.WithGroup(name)}
}

type multiHandler struct {
	handlers []slog.Handler
}

func (m *multiHandler) Enabled(ctx context.Context, level slog.Level) bool {
	for _, h := range m.handlers {
		if h.Enabled(ctx, level) {
			return true
		}
	}
	return false
}

func (m *multiHandler) Handle(ctx context.Context, r slog.Record) error {
	for _, h := range m.handlers {
		if h.Enabled(ctx, r.Level) {
			if err := h.Handle(ctx, r); err != nil {
				return err
			}
		}
	}
	return nil
}

func (m *multiHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	handlers := make([]slog.Handler, len(m.handlers))
	for i, h := range m.handlers {
		handlers[i] = h.WithAttrs(attrs)
	}
	return &multiHandler{handlers: handlers}
}

func (m *multiHandler) WithGroup(name string) slog.Handler {
	handlers := make([]slog.Handler, len(m.handlers))
	for i, h := range m.handlers {
		handlers[i] = h.WithGroup(name)
	}
	return &multiHandler{handlers: handlers}
}

type logEntry struct {
	Level   string `json:"level"`
	Source  string `json:"source"`
	Message string `json:"message"`
}

type hubHandler struct {
	manager  *devicehub.Manager
	deviceID string
	source   string
	session  string
	attrs    []slog.Attr
}

func (h *hubHandler) Enabled(_ context.Context, _ slog.Level) bool {
	return true
}

func (h *hubHandler) Handle(_ context.Context, r slog.Record) error {
	if h.deviceID == "" {
		return nil
	}

	hub := h.manager.Get(h.deviceID)
	if hub == nil {
		return nil
	}

	level := strings.ToLower(r.Level.String())

	msg := r.Message
	var parts []string
	r.Attrs(func(a slog.Attr) bool {
		if a.Key == "device_id" || a.Key == "source" || a.Key == "session_id" {
			return true
		}
		parts = append(parts, fmt.Sprintf("%s=%v", a.Key, a.Value))
		return true
	})
	for _, a := range h.attrs {
		if a.Key == "device_id" || a.Key == "source" || a.Key == "session_id" {
			continue
		}
		parts = append(parts, fmt.Sprintf("%s=%v", a.Key, a.Value))
	}
	if len(parts) > 0 {
		msg = msg + " " + strings.Join(parts, " ")
	}

	entry := logEntry{
		Level:   level,
		Source:  h.source,
		Message: msg,
	}

	data, err := devicehub.Marshal("log", h.session, entry)
	if err != nil {
		return nil
	}

	hub.Broadcast(data)
	return nil
}

func (h *hubHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	newH := &hubHandler{
		manager:  h.manager,
		deviceID: h.deviceID,
		source:   h.source,
		session:  h.session,
		attrs:    make([]slog.Attr, len(h.attrs), len(h.attrs)+len(attrs)),
	}
	copy(newH.attrs, h.attrs)

	for _, a := range attrs {
		switch a.Key {
		case "device_id":
			newH.deviceID = a.Value.String()
		case "source":
			newH.source = a.Value.String()
		case "session_id":
			newH.session = a.Value.String()
		default:
			newH.attrs = append(newH.attrs, a)
		}
	}

	return newH
}

func (h *hubHandler) WithGroup(_ string) slog.Handler {
	newH := &hubHandler{
		manager:  h.manager,
		deviceID: h.deviceID,
		source:   h.source,
		session:  h.session,
		attrs:    make([]slog.Attr, len(h.attrs)),
	}
	copy(newH.attrs, h.attrs)
	return newH
}
