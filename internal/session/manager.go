package session

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/joakimcarlsson/juicebox/internal/bridge"
	"github.com/joakimcarlsson/juicebox/internal/db"
	"github.com/joakimcarlsson/juicebox/internal/devicehub"
	"github.com/joakimcarlsson/juicebox/internal/logcat"
	"github.com/joakimcarlsson/juicebox/internal/proxy"
)

type Session struct {
	ID            string
	DeviceID      string
	BundleID      string
	Platform      string
	PID           int
	BridgeSession string
	Proxy         *proxy.Proxy
	ProxyPort     int
	Logcat        *logcat.Streamer
	StartedAt     int64
}

type Manager struct {
	certManager  *proxy.CertManager
	bridge       *bridge.Client
	hubManager   *devicehub.Manager
	database     *db.DB
	writer       *db.AsyncWriter
	deviceSetups map[string]DeviceSetup
	mu           sync.RWMutex
	sessions     map[string]*Session
}

func NewManager(cm *proxy.CertManager, bridgeClient *bridge.Client, hubManager *devicehub.Manager, database *db.DB, writer *db.AsyncWriter, deviceSetups map[string]DeviceSetup) *Manager {
	return &Manager{
		certManager:  cm,
		bridge:       bridgeClient,
		hubManager:   hubManager,
		database:     database,
		writer:       writer,
		deviceSetups: deviceSetups,
		sessions:     make(map[string]*Session),
	}
}

func (m *Manager) BridgeClient() *bridge.Client {
	return m.bridge
}

type AttachResult struct {
	SessionID string `json:"sessionId"`
	PID       int    `json:"pid"`
}

func (m *Manager) Attach(deviceId, bundleId, existingSessionId string) (*AttachResult, error) {
	logger := slog.With("device_id", deviceId, "source", "manager")

	isRestore := existingSessionId != ""

	deviceInfo, err := m.bridge.GetDeviceInfo(deviceId)
	if err != nil {
		return nil, fmt.Errorf("manager: get device info: %w", err)
	}
	platform := deviceInfo.Platform
	if platform == "" {
		platform = "android"
	}

	setup, ok := m.deviceSetups[platform]
	if !ok {
		setup = m.deviceSetups["android"]
	}

	sess := &Session{
		DeviceID: deviceId,
		BundleID: bundleId,
		Platform: platform,
	}

	hub := m.hubManager.GetOrCreate(deviceId)

	proxyLogger := slog.With("device_id", deviceId, "source", "proxy")
	p := proxy.NewProxy(m.certManager, func(msg proxy.AgentMessage) {
		data, err := devicehub.Marshal(msg.Type, sess.ID, msg.Payload)
		if err != nil {
			logger.Error("marshal error", "error", err)
			return
		}
		hub.Broadcast(data)

		if msg.Type == "http" {
			if httpMsg, ok := msg.Payload.(proxy.HttpMessage); ok {
				m.writer.WriteHttpMessage(httpMessageToRow(sess.ID, &httpMsg))
			}
		}
	}, proxyLogger)

	port, err := p.Start()
	if err != nil {
		return nil, fmt.Errorf("manager: start proxy: %w", err)
	}
	sess.Proxy = p
	sess.ProxyPort = port

	logger.Info("proxy started", "port", port, "bundle", bundleId)

	logger.Info("preparing device interception", "platform", platform)
	if err := setup.PrepareInterception(deviceId, m.certManager.CAPEMPath(), port); err != nil {
		logger.Error("device interception setup failed", "error", err)
		p.Stop()
		return nil, fmt.Errorf("manager: prepare interception: %w", err)
	}

	bridgeResp, err := m.bridge.Attach(deviceId, bundleId)
	if err != nil {
		logger.Error("bridge attach failed", "error", err)
		setup.CleanupInterception(deviceId)
		p.Stop()
		return nil, fmt.Errorf("manager: bridge attach: %w", err)
	}

	sess.PID = bridgeResp.PID
	sess.BridgeSession = bridgeResp.SessionID
	sess.StartedAt = time.Now().UnixMilli()

	if isRestore {
		sess.ID = existingSessionId
		if err := m.database.ReopenSession(existingSessionId, sess.PID); err != nil {
			logger.Error("failed to reopen session", "error", err)
		}
		logger.Info("restored session", "session_id", existingSessionId)
	} else {
		sess.ID = bridgeResp.SessionID
		if err := m.database.InsertSession(&db.SessionRow{
			ID:        sess.ID,
			DeviceID:  sess.DeviceID,
			BundleID:  sess.BundleID,
			PID:       sess.PID,
			Platform:  platform,
			StartedAt: sess.StartedAt,
		}); err != nil {
			logger.Error("failed to persist session", "error", err)
		}
	}

	m.mu.Lock()
	m.sessions[sess.ID] = sess
	m.mu.Unlock()

	go m.bridgeSubscribeForward(sess)

	if setup.SupportsLogcat() {
		logcatLogger := slog.With("device_id", deviceId, "source", "logcat", "session_id", sess.ID)
		lc := logcat.NewStreamer(deviceId, sess.PID, func(entry *logcat.Entry) {
			data, err := devicehub.Marshal("logcat", sess.ID, entry)
			if err != nil {
				logcatLogger.Error("marshal logcat entry", "error", err)
				return
			}
			hub.Broadcast(data)

			m.writer.WriteLogcatEntry(&db.LogcatEntryRow{
				ID:        entry.ID,
				SessionID: sess.ID,
				Timestamp: entry.Timestamp,
				PID:       entry.PID,
				TID:       entry.TID,
				Level:     string(entry.Level),
				Tag:       entry.Tag,
				Message:   entry.Message,
			})
		}, logcatLogger)

		if err := lc.Start(); err != nil {
			logger.Warn("logcat start failed (non-fatal)", "error", err)
		} else {
			sess.Logcat = lc
		}
	}

	logger = logger.With("session_id", sess.ID)
	logger.Info("attached", "bundle", bundleId, "pid", sess.PID, "platform", platform)

	return &AttachResult{
		SessionID: sess.ID,
		PID:       sess.PID,
	}, nil
}

func (m *Manager) Detach(sessionId string) error {
	m.mu.Lock()
	sess, ok := m.sessions[sessionId]
	if ok {
		delete(m.sessions, sessionId)
	}
	m.mu.Unlock()

	if !ok {
		if err := m.database.EndSession(sessionId, time.Now().UnixMilli()); err != nil {
			slog.Error("failed to end session in db", "error", err, "session_id", sessionId)
		}
		return m.bridge.Detach(sessionId)
	}

	logger := slog.With("device_id", sess.DeviceID, "source", "manager", "session_id", sessionId)

	if err := m.database.EndSession(sessionId, time.Now().UnixMilli()); err != nil {
		logger.Error("failed to end session in db", "error", err)
	}

	if err := m.bridge.Detach(sess.BridgeSession); err != nil {
		logger.Warn("bridge detach error", "error", err)
	}

	if sess.Logcat != nil {
		sess.Logcat.Stop()
	}

	if setup, ok := m.deviceSetups[sess.Platform]; ok {
		setup.CleanupInterception(sess.DeviceID)
	} else if fallback, ok := m.deviceSetups["android"]; ok {
		fallback.CleanupInterception(sess.DeviceID)
	}

	sess.Proxy.Stop()

	logger.Info("detached session")
	return nil
}

func (m *Manager) GetSession(sessionId string) *Session {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.sessions[sessionId]
}

func (m *Manager) bridgeSubscribeForward(sess *Session) {
	logger := slog.With("device_id", sess.DeviceID, "source", "manager", "session_id", sess.ID)

	sub, err := m.bridge.Subscribe(sess.BridgeSession)
	if err != nil {
		logger.Error("bridge subscribe failed", "error", err)
		return
	}
	defer sub.Close()

	hub := m.hubManager.GetOrCreate(sess.DeviceID)

	buf := make([]byte, 1024*1024)
	for {
		n, err := sub.Read(buf)
		if err != nil {
			return
		}

		line := buf[:n]
		if len(line) == 0 {
			continue
		}

		var msg struct {
			Type    string          `json:"type"`
			Payload json.RawMessage `json:"payload"`
		}
		if err := json.Unmarshal(line, &msg); err != nil || msg.Type == "" {
			continue
		}

		data, err := devicehub.Marshal(msg.Type, sess.ID, msg.Payload)
		if err != nil {
			continue
		}
		hub.Broadcast(data)
	}
}

func httpMessageToRow(sessionID string, msg *proxy.HttpMessage) *db.HttpMessageRow {
	reqHeaders, _ := json.Marshal(msg.RequestHeaders)
	respHeaders, _ := json.Marshal(msg.ResponseHeaders)

	return &db.HttpMessageRow{
		ID:                   msg.ID,
		SessionID:            sessionID,
		Method:               msg.Method,
		URL:                  msg.URL,
		RequestHeaders:       string(reqHeaders),
		RequestBody:          msg.RequestBody,
		RequestBodyEncoding:  msg.RequestBodyEncoding,
		RequestBodySize:      msg.RequestBodySize,
		StatusCode:           msg.StatusCode,
		ResponseHeaders:      string(respHeaders),
		ResponseBody:         msg.ResponseBody,
		ResponseBodyEncoding: msg.ResponseBodyEncoding,
		ResponseBodySize:     msg.ResponseBodySize,
		Duration:             msg.Duration,
		Timestamp:            msg.Timestamp,
	}
}
