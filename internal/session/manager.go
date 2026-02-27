package session

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"sync"
	"time"

	"github.com/joakimcarlsson/juicebox/internal/bridge"
	"github.com/joakimcarlsson/juicebox/internal/db"
	"github.com/joakimcarlsson/juicebox/internal/devicehub"
	"github.com/joakimcarlsson/juicebox/internal/logcat"
	"github.com/joakimcarlsson/juicebox/internal/proxy"
)

type DeviceConnection struct {
	DeviceID  string
	Platform  string
	Proxy     *proxy.Proxy
	ProxyPort int
	Intercept *proxy.InterceptEngine
	Setup     DeviceSetup
	Hub       *devicehub.Hub
	mu        sync.RWMutex
	Sessions  map[string]*Session
}

func (dc *DeviceConnection) activeSessionID() string {
	dc.mu.RLock()
	defer dc.mu.RUnlock()
	for id := range dc.Sessions {
		return id
	}
	return ""
}

type Session struct {
	ID              string
	DeviceID        string
	BundleID        string
	PID             int
	BridgeSessionID string
	LogStream       io.Closer
	StartedAt       int64
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
	devices      map[string]*DeviceConnection
}

func NewManager(
	cm *proxy.CertManager,
	bridgeClient *bridge.Client,
	hubManager *devicehub.Manager,
	database *db.DB,
	writer *db.AsyncWriter,
	deviceSetups map[string]DeviceSetup,
) *Manager {
	return &Manager{
		certManager:  cm,
		bridge:       bridgeClient,
		hubManager:   hubManager,
		database:     database,
		writer:       writer,
		deviceSetups: deviceSetups,
		sessions:     make(map[string]*Session),
		devices:      make(map[string]*DeviceConnection),
	}
}

type ConnectResult struct {
	DeviceID     string   `json:"deviceId"`
	Platform     string   `json:"platform"`
	Capabilities []string `json:"capabilities"`
	ProxyPort    int      `json:"proxyPort"`
}

func (m *Manager) ConnectDevice(deviceID string) (*ConnectResult, error) {
	logger := slog.With("device_id", deviceID, "source", "manager")

	m.mu.RLock()
	if existing, ok := m.devices[deviceID]; ok {
		m.mu.RUnlock()
		return &ConnectResult{
			DeviceID:     deviceID,
			Platform:     existing.Platform,
			Capabilities: existing.Setup.Capabilities(),
			ProxyPort:    existing.ProxyPort,
		}, nil
	}
	m.mu.RUnlock()

	bridgeResp, err := m.bridge.ConnectDevice(deviceID)
	if err != nil {
		return nil, fmt.Errorf("manager: connect device: %w", err)
	}

	platform := bridgeResp.Platform
	if platform == "" {
		platform = "android"
	}

	setup, ok := m.deviceSetups[platform]
	if !ok {
		setup = m.deviceSetups["android"]
	}

	hub := m.hubManager.GetOrCreate(deviceID)

	dc := &DeviceConnection{
		DeviceID: deviceID,
		Platform: platform,
		Setup:    setup,
		Hub:      hub,
		Sessions: make(map[string]*Session),
	}

	proxyLogger := slog.With("device_id", deviceID, "source", "proxy")
	p := proxy.NewProxy(m.certManager, func(msg proxy.AgentMessage) {
		sessID := dc.activeSessionID()
		if sessID == "" {
			return
		}
		data, err := devicehub.Marshal(msg.Type, sessID, msg.Payload)
		if err != nil {
			logger.Error("marshal error", "error", err)
			return
		}
		hub.Broadcast(data)

		if msg.Type == "http" {
			if httpMsg, ok := msg.Payload.(proxy.HttpMessage); ok {
				m.writer.WriteHttpMessage(httpMessageToRow(sessID, &httpMsg))
			}
		}
	}, proxyLogger)

	interceptEngine := proxy.NewInterceptEngine(
		func(msgType string, payload any) {
			sessID := dc.activeSessionID()
			if sessID == "" {
				return
			}
			data, err := devicehub.Marshal(msgType, sessID, payload)
			if err != nil {
				logger.Error("marshal intercept", "error", err)
				return
			}
			hub.Broadcast(data)
		},
		proxyLogger,
	)
	p.SetInterceptEngine(interceptEngine)

	port, err := p.Start()
	if err != nil {
		return nil, fmt.Errorf("manager: start proxy: %w", err)
	}
	dc.Proxy = p
	dc.ProxyPort = port
	dc.Intercept = interceptEngine

	logger.Info("proxy started", "port", port)

	if err := setup.PrepareInterception(deviceID, m.certManager.CAPEMPath(), port); err != nil {
		logger.Error("device interception setup failed", "error", err)
		p.Stop()
		return nil, fmt.Errorf("manager: prepare interception: %w", err)
	}

	m.mu.Lock()
	m.devices[deviceID] = dc
	m.mu.Unlock()

	logger.Info("device connected", "platform", platform)

	return &ConnectResult{
		DeviceID:     deviceID,
		Platform:     platform,
		Capabilities: setup.Capabilities(),
		ProxyPort:    port,
	}, nil
}

func (m *Manager) DisconnectDevice(deviceID string) error {
	m.mu.Lock()
	dc, ok := m.devices[deviceID]
	if !ok {
		m.mu.Unlock()
		return fmt.Errorf("device %s not connected", deviceID)
	}
	delete(m.devices, deviceID)

	var sessionsToDetach []*Session
	dc.mu.RLock()
	for _, sess := range dc.Sessions {
		sessionsToDetach = append(sessionsToDetach, sess)
		delete(m.sessions, sess.ID)
	}
	dc.mu.RUnlock()
	m.mu.Unlock()

	logger := slog.With("device_id", deviceID, "source", "manager")

	for _, sess := range sessionsToDetach {
		m.cleanupSession(sess, logger)
	}

	if err := m.bridge.DisconnectDevice(deviceID); err != nil {
		logger.Warn("bridge disconnect error", "error", err)
	}

	if dc.Intercept != nil {
		dc.Intercept.ResolveAll(proxy.ActionForward)
	}

	_ = dc.Setup.CleanupInterception(deviceID)
	dc.Proxy.Stop()

	logger.Info("device disconnected")
	return nil
}

type SpawnResult struct {
	SessionID    string   `json:"sessionId"`
	PID          int      `json:"pid"`
	Capabilities []string `json:"capabilities"`
}

func (m *Manager) SpawnApp(
	deviceID, bundleID string,
	evasion *bridge.EvasionConfig,
) (*SpawnResult, error) {
	m.mu.RLock()
	dc, ok := m.devices[deviceID]
	m.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("device %s not connected", deviceID)
	}

	logger := slog.With("device_id", deviceID, "source", "manager")

	bridgeResp, err := m.bridge.SpawnApp(deviceID, bundleID, evasion)
	if err != nil {
		return nil, fmt.Errorf("manager: spawn app: %w", err)
	}

	sess := &Session{
		ID:              bridgeResp.SessionID,
		DeviceID:        deviceID,
		BundleID:        bundleID,
		PID:             bridgeResp.PID,
		BridgeSessionID: bridgeResp.SessionID,
		StartedAt:       time.Now().UnixMilli(),
	}

	capsJSON, _ := json.Marshal(dc.Setup.Capabilities())
	if err := m.database.InsertSession(&db.SessionRow{
		ID:           sess.ID,
		DeviceID:     sess.DeviceID,
		BundleID:     sess.BundleID,
		PID:          sess.PID,
		Platform:     dc.Platform,
		Capabilities: string(capsJSON),
		StartedAt:    sess.StartedAt,
	}); err != nil {
		logger.Error("failed to persist session", "error", err)
	}

	m.mu.Lock()
	m.sessions[sess.ID] = sess
	m.mu.Unlock()

	dc.mu.Lock()
	dc.Sessions[sess.ID] = sess
	dc.mu.Unlock()

	go m.bridgeSubscribeForward(sess, dc)

	logStreamLogger := slog.With(
		"device_id", deviceID,
		"source", "logstream",
		"session_id", sess.ID,
	)
	closer, err := dc.Setup.StartLogStream(
		deviceID,
		sess.PID,
		func(entry *logcat.Entry) {
			data, err := devicehub.Marshal("logcat", sess.ID, entry)
			if err != nil {
				logStreamLogger.Error("marshal log entry", "error", err)
				return
			}
			dc.Hub.Broadcast(data)

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
		},
		logStreamLogger,
	)
	if err != nil {
		logger.Warn("log stream start failed (non-fatal)", "error", err)
	} else if closer != nil {
		sess.LogStream = closer
	}

	logger.Info(
		"spawned app",
		"bundle",
		bundleID,
		"pid",
		sess.PID,
		"session_id",
		sess.ID,
	)

	return &SpawnResult{
		SessionID:    sess.ID,
		PID:          sess.PID,
		Capabilities: dc.Setup.Capabilities(),
	}, nil
}

func (m *Manager) AttachApp(deviceID, bundleID string) (*SpawnResult, error) {
	m.mu.RLock()
	dc, ok := m.devices[deviceID]
	m.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("device %s not connected", deviceID)
	}

	logger := slog.With("device_id", deviceID, "source", "manager")

	bridgeResp, err := m.bridge.Attach(deviceID, bundleID, nil, true)
	if err != nil {
		return nil, fmt.Errorf("manager: attach app: %w", err)
	}

	sess := &Session{
		ID:              bridgeResp.SessionID,
		DeviceID:        deviceID,
		BundleID:        bundleID,
		PID:             bridgeResp.PID,
		BridgeSessionID: bridgeResp.SessionID,
		StartedAt:       time.Now().UnixMilli(),
	}

	capsJSON, _ := json.Marshal(dc.Setup.Capabilities())
	if err := m.database.InsertSession(&db.SessionRow{
		ID:           sess.ID,
		DeviceID:     sess.DeviceID,
		BundleID:     sess.BundleID,
		PID:          sess.PID,
		Platform:     dc.Platform,
		Capabilities: string(capsJSON),
		StartedAt:    sess.StartedAt,
	}); err != nil {
		logger.Error("failed to persist session", "error", err)
	}

	m.mu.Lock()
	m.sessions[sess.ID] = sess
	m.mu.Unlock()

	dc.mu.Lock()
	dc.Sessions[sess.ID] = sess
	dc.mu.Unlock()

	scripts, err := m.database.GetScriptFiles(deviceID)
	if err != nil {
		logger.Warn("failed to load device scripts", "error", err)
	}
	for _, sf := range scripts {
		if sf.Content == "" {
			continue
		}
		_, err := m.bridge.RunScript(
			sess.BridgeSessionID,
			sf.Content,
			sf.Name,
			3,
		)
		if err != nil {
			logger.Warn(
				"failed to inject device script",
				"script",
				sf.Name,
				"error",
				err,
			)
		} else {
			logger.Info("injected device script", "script", sf.Name)
		}
	}

	if err := m.bridge.ResumeApp(deviceID, sess.PID); err != nil {
		logger.Error("failed to resume app after hook injection", "error", err)
	} else {
		logger.Info("attached to app", "bundle", bundleID, "pid", sess.PID)
	}

	go m.bridgeSubscribeForward(sess, dc)

	logStreamLogger := slog.With(
		"device_id", deviceID,
		"source", "logstream",
		"session_id", sess.ID,
	)
	closer, err := dc.Setup.StartLogStream(
		deviceID,
		sess.PID,
		func(entry *logcat.Entry) {
			data, err := devicehub.Marshal("logcat", sess.ID, entry)
			if err != nil {
				logStreamLogger.Error("marshal log entry", "error", err)
				return
			}
			dc.Hub.Broadcast(data)

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
		},
		logStreamLogger,
	)
	if err != nil {
		logger.Warn("log stream start failed (non-fatal)", "error", err)
	} else if closer != nil {
		sess.LogStream = closer
	}

	logger.Info(
		"attached to app",
		"bundle",
		bundleID,
		"pid",
		sess.PID,
		"session_id",
		sess.ID,
	)

	return &SpawnResult{
		SessionID:    sess.ID,
		PID:          sess.PID,
		Capabilities: dc.Setup.Capabilities(),
	}, nil
}

func (m *Manager) DetachApp(sessionID string) error {
	m.mu.Lock()
	sess, ok := m.sessions[sessionID]
	if ok {
		delete(m.sessions, sessionID)
	}
	var dc *DeviceConnection
	if ok {
		dc = m.devices[sess.DeviceID]
	}
	m.mu.Unlock()

	if !ok {
		if err := m.database.EndSession(sessionID, time.Now().UnixMilli()); err != nil {
			slog.Error(
				"failed to end session in db",
				"error",
				err,
				"session_id",
				sessionID,
			)
		}
		return m.bridge.DetachApp(sessionID)
	}

	if dc != nil {
		dc.mu.Lock()
		delete(dc.Sessions, sessionID)
		dc.mu.Unlock()
	}

	logger := slog.With(
		"device_id",
		sess.DeviceID,
		"source",
		"manager",
		"session_id",
		sessionID,
	)
	m.cleanupSession(sess, logger)
	logger.Info("detached app session")
	return nil
}

func (m *Manager) cleanupSession(sess *Session, logger *slog.Logger) {
	if err := m.database.EndSession(sess.ID, time.Now().UnixMilli()); err != nil {
		logger.Error("failed to end session in db", "error", err)
	}

	if err := m.bridge.DetachApp(sess.BridgeSessionID); err != nil {
		logger.Warn("bridge detach error", "error", err)
	}

	if sess.LogStream != nil {
		sess.LogStream.Close()
	}
}

func (m *Manager) GetSession(sessionID string) *Session {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.sessions[sessionID]
}

func (m *Manager) GetDeviceConnection(deviceID string) *DeviceConnection {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.devices[deviceID]
}

func (m *Manager) RunScript(
	sessionID, code, name string,
	initialWaitSecs int,
) (*bridge.RunScriptResponse, error) {
	m.mu.RLock()
	sess, ok := m.sessions[sessionID]
	m.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("session %s not found", sessionID)
	}
	return m.bridge.RunScript(sess.BridgeSessionID, code, name, initialWaitSecs)
}

func (m *Manager) GetScriptOutput(
	sessionID, name string,
	since, limit int,
) (*bridge.GetScriptOutputResponse, error) {
	m.mu.RLock()
	sess, ok := m.sessions[sessionID]
	m.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("session %s not found", sessionID)
	}
	return m.bridge.GetScriptOutput(sess.BridgeSessionID, name, since, limit)
}

func (m *Manager) StopScript(
	sessionID, name string,
) (*bridge.StopScriptResponse, error) {
	m.mu.RLock()
	sess, ok := m.sessions[sessionID]
	m.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("session %s not found", sessionID)
	}
	return m.bridge.StopScript(sess.BridgeSessionID, name)
}

func (m *Manager) AgentInvoke(
	sessionID, namespace, method string,
	args []any,
) (json.RawMessage, error) {
	m.mu.RLock()
	sess, ok := m.sessions[sessionID]
	m.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("session %s not found", sessionID)
	}
	return m.bridge.AgentInvoke(sess.BridgeSessionID, namespace, method, args)
}

func (m *Manager) bridgeSubscribeForward(sess *Session, dc *DeviceConnection) {
	logger := slog.With(
		"device_id", sess.DeviceID,
		"source", "manager",
		"session_id", sess.ID,
	)

	sub, err := m.bridge.Subscribe(sess.BridgeSessionID)
	if err != nil {
		logger.Error("bridge subscribe failed", "error", err)
		return
	}
	defer sub.Close()

	scanner := bufio.NewScanner(sub)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Bytes()
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
		dc.Hub.Broadcast(data)

		if msg.Type == "crypto" {
			var cryptoEvt struct {
				ID        string  `json:"id"`
				Operation string  `json:"operation"`
				Algorithm string  `json:"algorithm"`
				Input     *string `json:"input"`
				Output    *string `json:"output"`
				Key       *string `json:"key"`
				IV        *string `json:"iv"`
				Timestamp int64   `json:"timestamp"`
			}
			if err := json.Unmarshal(msg.Payload, &cryptoEvt); err == nil &&
				cryptoEvt.ID != "" {
				if cryptoEvt.Timestamp == 0 {
					cryptoEvt.Timestamp = time.Now().UnixMilli()
				}
				m.writer.WriteCryptoEvent(&db.CryptoEventRow{
					ID:        cryptoEvt.ID,
					SessionID: sess.ID,
					Operation: cryptoEvt.Operation,
					Algorithm: cryptoEvt.Algorithm,
					Input:     cryptoEvt.Input,
					Output:    cryptoEvt.Output,
					Key:       cryptoEvt.Key,
					IV:        cryptoEvt.IV,
					Timestamp: cryptoEvt.Timestamp,
				})
			}
		}

		if msg.Type == "clipboard" {
			var clipEvt struct {
				ID          string  `json:"id"`
				Direction   string  `json:"direction"`
				Content     *string `json:"content"`
				MimeType    *string `json:"mimeType"`
				CallerStack *string `json:"callerStack"`
				Timestamp   int64   `json:"timestamp"`
			}
			if err := json.Unmarshal(msg.Payload, &clipEvt); err == nil &&
				clipEvt.ID != "" {
				if clipEvt.Timestamp == 0 {
					clipEvt.Timestamp = time.Now().UnixMilli()
				}
				m.writer.WriteClipboardEvent(&db.ClipboardEventRow{
					ID:          clipEvt.ID,
					SessionID:   sess.ID,
					Direction:   clipEvt.Direction,
					Content:     clipEvt.Content,
					MimeType:    clipEvt.MimeType,
					CallerStack: clipEvt.CallerStack,
					Timestamp:   clipEvt.Timestamp,
				})
			}
		}

		if msg.Type == "crash" {
			var crash struct {
				ID               string            `json:"id"`
				CrashType        string            `json:"crashType"`
				Signal           *string           `json:"signal"`
				Address          *string           `json:"address"`
				Registers        map[string]string `json:"registers"`
				Backtrace        []string          `json:"backtrace"`
				JavaStackTrace   *string           `json:"javaStackTrace"`
				ExceptionClass   *string           `json:"exceptionClass"`
				ExceptionMessage *string           `json:"exceptionMessage"`
				Timestamp        int64             `json:"timestamp"`
			}
			if err := json.Unmarshal(msg.Payload, &crash); err == nil &&
				crash.ID != "" {
				var regsJSON *string
				if crash.Registers != nil {
					b, _ := json.Marshal(crash.Registers)
					s := string(b)
					regsJSON = &s
				}
				var btJSON *string
				if crash.Backtrace != nil {
					b, _ := json.Marshal(crash.Backtrace)
					s := string(b)
					btJSON = &s
				}
				if crash.Timestamp == 0 {
					crash.Timestamp = time.Now().UnixMilli()
				}
				m.writer.WriteCrash(&db.CrashRow{
					ID:               crash.ID,
					SessionID:        sess.ID,
					CrashType:        crash.CrashType,
					Signal:           crash.Signal,
					Address:          crash.Address,
					Registers:        regsJSON,
					Backtrace:        btJSON,
					JavaStackTrace:   crash.JavaStackTrace,
					ExceptionClass:   crash.ExceptionClass,
					ExceptionMessage: crash.ExceptionMessage,
					Timestamp:        crash.Timestamp,
				})
			}
		}
	}

	if err := scanner.Err(); err != nil {
		logger.Error("bridge subscribe stream error", "error", err)
	}
}

func httpMessageToRow(
	sessionID string,
	msg *proxy.HttpMessage,
) *db.HttpMessageRow {
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
