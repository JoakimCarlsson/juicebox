package session

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"

	"github.com/joakimcarlsson/juicebox/internal/adb"
	"github.com/joakimcarlsson/juicebox/internal/bridge"
	"github.com/joakimcarlsson/juicebox/internal/devicehub"
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
	sess := &Session{
		DeviceID: deviceId,
		BundleID: bundleId,
	}

	hub := m.hubManager.GetOrCreate(deviceId)

	p := proxy.NewProxy(m.certManager, func(msg proxy.AgentMessage) {
		data, err := devicehub.Marshal(msg.Type, sess.ID, msg.Payload)
		if err != nil {
			log.Printf("[manager] marshal error: %v", err)
			return
		}
		hub.Broadcast(data)
	})

	port, err := p.Start()
	if err != nil {
		return nil, fmt.Errorf("manager: start proxy: %w", err)
	}
	sess.Proxy = p
	sess.ProxyPort = port

	log.Printf("[manager] proxy started on port %d for %s", port, bundleId)

	if err := adb.InstallCACert(deviceId, m.certManager.CAPEMPath()); err != nil {
		log.Printf("[manager] CA cert install failed: %v", err)
		p.Stop()
		return nil, fmt.Errorf("manager: install ca cert: %w", err)
	}

	if err := adb.ReversePort(deviceId, deviceProxyPort, port); err != nil {
		log.Printf("[manager] adb reverse failed: %v", err)
		p.Stop()
		return nil, fmt.Errorf("manager: adb reverse: %w", err)
	}

	if err := adb.SetProxy(deviceId, "127.0.0.1", deviceProxyPort); err != nil {
		log.Printf("[manager] set proxy failed: %v", err)
		adb.RemoveReverse(deviceId, deviceProxyPort)
		p.Stop()
		return nil, fmt.Errorf("manager: set proxy: %w", err)
	}

	bridgeResp, err := m.bridge.Attach(deviceId, bundleId)
	if err != nil {
		log.Printf("[manager] bridge attach failed: %v", err)
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

	log.Printf("[manager] attached %s (pid %d), session %s", bundleId, sess.PID, sess.ID)

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

	if err := m.bridge.Detach(sess.BridgeSession); err != nil {
		log.Printf("[manager] bridge detach error: %v", err)
	}

	adb.ClearProxy(sess.DeviceID)
	adb.RemoveReverse(sess.DeviceID, deviceProxyPort)

	sess.Proxy.Stop()

	log.Printf("[manager] detached session %s", sessionId)
	return nil
}

func (m *Manager) GetSession(sessionId string) *Session {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.sessions[sessionId]
}

func (m *Manager) bridgeSubscribeForward(sess *Session) {
	sub, err := m.bridge.Subscribe(sess.ID)
	if err != nil {
		log.Printf("[manager] bridge subscribe error for %s: %v", sess.ID, err)
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
