package devicehub

import "sync"

type Manager struct {
	mu   sync.RWMutex
	hubs map[string]*Hub
}

func NewManager() *Manager {
	return &Manager{
		hubs: make(map[string]*Hub),
	}
}

func (m *Manager) GetOrCreate(deviceID string) *Hub {
	m.mu.Lock()
	defer m.mu.Unlock()
	if h, ok := m.hubs[deviceID]; ok {
		return h
	}
	h := newHub(deviceID)
	m.hubs[deviceID] = h
	return h
}

func (m *Manager) Get(deviceID string) *Hub {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.hubs[deviceID]
}
