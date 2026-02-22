package session

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"

	"github.com/joakimcarlsson/juicebox/internal/adb"
	"github.com/joakimcarlsson/juicebox/internal/bridge"
	"github.com/joakimcarlsson/juicebox/internal/devicehub"
	"github.com/joakimcarlsson/juicebox/internal/logcat"
	"github.com/joakimcarlsson/juicebox/internal/proxy"
)

const deviceProxyPort = 8082

type Session struct {
	ID            string
	DeviceID      string
	BundleID      string
	PID           int
	BridgeSession string
	Proxy         *proxy.Proxy
	ProxyPort     int
	Logcat        *logcat.Streamer
}

type Manager struct {
	certManager *proxy.CertManager
	bridge      *bridge.Client
	hubManager  *devicehub.Manager
	mu          sync.RWMutex
	sessions    map[string]*Session
}

func NewManager(cm *proxy.CertManager, bridgeClient *bridge.Client, hubManager *devicehub.Manager) *Manager {
	return &Manager{
		certManager: cm,
		bridge:      bridgeClient,
		hubManager:  hubManager,
		sessions:    make(map[string]*Session),
	}
}

func (m *Manager) BridgeClient() *bridge.Client {
	return m.bridge
}

type AttachResult struct {
	SessionID string `json:"sessionId"`
	PID       int    `json:"pid"`
}

func (m *Manager) Attach(deviceId, bundleId string) (*AttachResult, error) {
	logger := slog.With("device_id", deviceId, "source", "manager")

	sess := &Session{
		DeviceID: deviceId,
		BundleID: bundleId,
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
	}, proxyLogger)

	port, err := p.Start()
	if err != nil {
		return nil, fmt.Errorf("manager: start proxy: %w", err)
	}
	sess.Proxy = p
	sess.ProxyPort = port

	logger.Info("proxy started", "port", port, "bundle", bundleId)

	logger.Info("installing CA certificate")
	if err := adb.InstallCACert(deviceId, m.certManager.CAPEMPath()); err != nil {
		logger.Error("CA cert install failed", "error", err)
		p.Stop()
		return nil, fmt.Errorf("manager: install ca cert: %w", err)
	}
	logger.Info("CA cert installed via tmpfs overlay")

	if err := adb.ReversePort(deviceId, deviceProxyPort, port); err != nil {
		logger.Error("adb reverse failed", "error", err)
		p.Stop()
		return nil, fmt.Errorf("manager: adb reverse: %w", err)
	}

	if err := adb.SetProxy(deviceId, "127.0.0.1", deviceProxyPort); err != nil {
		logger.Error("set proxy failed", "error", err)
		adb.RemoveReverse(deviceId, deviceProxyPort)
		p.Stop()
		return nil, fmt.Errorf("manager: set proxy: %w", err)
	}

	bridgeResp, err := m.bridge.Attach(deviceId, bundleId)
	if err != nil {
		logger.Error("bridge attach failed", "error", err)
		adb.ClearProxy(deviceId)
		adb.RemoveReverse(deviceId, deviceProxyPort)
		p.Stop()
		return nil, fmt.Errorf("manager: bridge attach: %w", err)
	}

	sess.ID = bridgeResp.SessionID
	sess.PID = bridgeResp.PID
	sess.BridgeSession = bridgeResp.SessionID

	m.mu.Lock()
	m.sessions[sess.ID] = sess
	m.mu.Unlock()

	go m.bridgeSubscribeForward(sess)

	logcatLogger := slog.With("device_id", deviceId, "source", "logcat", "session_id", sess.ID)
	lc := logcat.NewStreamer(deviceId, sess.PID, func(entry *logcat.Entry) {
		data, err := devicehub.Marshal("logcat", sess.ID, entry)
		if err != nil {
			logcatLogger.Error("marshal logcat entry", "error", err)
			return
		}
		hub.Broadcast(data)
	}, logcatLogger)

	if err := lc.Start(); err != nil {
		logger.Warn("logcat start failed (non-fatal)", "error", err)
	} else {
		sess.Logcat = lc
	}

	logger = logger.With("session_id", sess.ID)
	logger.Info("attached", "bundle", bundleId, "pid", sess.PID)

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
		return m.bridge.Detach(sessionId)
	}

	logger := slog.With("device_id", sess.DeviceID, "source", "manager", "session_id", sessionId)

	if err := m.bridge.Detach(sess.BridgeSession); err != nil {
		logger.Warn("bridge detach error", "error", err)
	}

	if sess.Logcat != nil {
		sess.Logcat.Stop()
	}

	adb.ClearProxy(sess.DeviceID)
	adb.RemoveReverse(sess.DeviceID, deviceProxyPort)

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

	sub, err := m.bridge.Subscribe(sess.ID)
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
