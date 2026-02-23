package chat

import (
	"context"

	"github.com/joakimcarlsson/ai/agent/session"
)

type ChatSessionStore struct {
	store session.Store
}

func NewChatSessionStore(store session.Store) *ChatSessionStore {
	return &ChatSessionStore{store: store}
}

func (s *ChatSessionStore) GetOrCreate(sessionID string) session.Store {
	return s.store
}

func (s *ChatSessionStore) Delete(sessionID string) {
	_ = s.store.Delete(context.Background(), sessionID)
}
