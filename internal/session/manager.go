package session

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/joakimcarlsson/juicebox/internal/adb"
	"github.com/joakimcarlsson/juicebox/internal/bridge"
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

	mu            sync.Mutex
	subscribers   map[*websocket.Conn]struct{}
	messageBuffer [][]byte
}

func (s *Session) addSubscriber(ws *websocket.Conn) [][]byte {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.subscribers[ws] = struct{}{}
	buffered := s.messageBuffer
	s.messageBuffer = nil
	return buffered
}

func (s *Session) removeSubscriber(ws *websocket.Conn) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.subscribers, ws)
}

func (s *Session) broadcast(data []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if len(s.subscribers) == 0 {
		s.messageBuffer = append(s.messageBuffer, data)
		return
	}

	for ws := range s.subscribers {
		if err := ws.WriteMessage(websocket.TextMessage, data); err != nil {
			delete(s.subscribers, ws)
			ws.Close()
		}
	}
}

type Manager struct {
	certManager *proxy.CertManager
	bridge      *bridge.Client
	mu          sync.RWMutex
	sessions    map[string]*Session
}

func NewManager(cm *proxy.CertManager, bridgeClient *bridge.Client) *Manager {
	return &Manager{
		certManager: cm,
		bridge:      bridgeClient,
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
		DeviceID:    deviceId,
		BundleID:    bundleId,
		subscribers: make(map[*websocket.Conn]struct{}),
	}

	p := proxy.NewProxy(m.certManager, func(msg proxy.AgentMessage) {
		data, err := proxy.MarshalMessage(msg)
		if err != nil {
			log.Printf("[manager] marshal error: %v", err)
			return
		}
		sess.broadcast(data)
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

	sess.mu.Lock()
	for ws := range sess.subscribers {
		ws.Close()
	}
	sess.mu.Unlock()

	log.Printf("[manager] detached session %s", sessionId)
	return nil
}

func (m *Manager) GetSession(sessionId string) *Session {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.sessions[sessionId]
}

func (m *Manager) Subscribe(sessionId string, ws *websocket.Conn) error {
	sess := m.GetSession(sessionId)
	if sess == nil {
		return fmt.Errorf("session not found: %s", sessionId)
	}

	buffered := sess.addSubscriber(ws)
	for _, data := range buffered {
		if err := ws.WriteMessage(websocket.TextMessage, data); err != nil {
			sess.removeSubscriber(ws)
			return err
		}
	}

	go m.bridgeSubscribeForward(sessionId, sess)

	for {
		if _, _, err := ws.ReadMessage(); err != nil {
			break
		}
	}

	sess.removeSubscriber(ws)
	return nil
}

func (m *Manager) bridgeSubscribeForward(sessionId string, sess *Session) {
	sub, err := m.bridge.Subscribe(sessionId)
	if err != nil {
		log.Printf("[manager] bridge subscribe error for %s: %v", sessionId, err)
		return
	}
	defer sub.Close()

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
			Type string `json:"type"`
		}
		if json.Unmarshal(line, &msg) == nil && msg.Type == "http" {
			sess.broadcast(append([]byte{}, line...))
		}
	}
}
