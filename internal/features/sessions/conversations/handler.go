package conversations

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"

	"github.com/joakimcarlsson/go-router/router/v2"
	"github.com/joakimcarlsson/juicebox/internal/db"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/chat"
	"github.com/joakimcarlsson/juicebox/internal/response"
)

type Handler struct {
	db        *db.DB
	chatStore *chat.ChatSessionStore
}

func NewHandler(database *db.DB, chatStore *chat.ChatSessionStore) *Handler {
	return &Handler{db: database, chatStore: chatStore}
}

func newID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (h *Handler) List(c *router.Context) {
	deviceID := c.Param("deviceId")
	if deviceID == "" {
		response.Error(c, http.StatusBadRequest, "missing deviceId")
		return
	}

	convos, err := h.db.ListConversations(c.Request.Context(), deviceID)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.JSON(http.StatusOK, map[string]any{"conversations": convos})
}

type createRequest struct {
	Model string `json:"model"`
}

func (h *Handler) Create(c *router.Context) {
	deviceID := c.Param("deviceId")
	if deviceID == "" {
		response.Error(c, http.StatusBadRequest, "missing deviceId")
		return
	}

	var req createRequest
	if err := json.NewDecoder(c.Request.Body).Decode(&req); err != nil {
		req = createRequest{}
	}

	convo, err := h.db.CreateConversation(
		c.Request.Context(),
		newID(),
		deviceID,
		"",
		req.Model,
	)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.JSON(http.StatusCreated, convo)
}

type updateRequest struct {
	Title *string `json:"title"`
	Model *string `json:"model"`
}

func (h *Handler) Update(c *router.Context) {
	convoID := c.Param("conversationId")
	if convoID == "" {
		response.Error(c, http.StatusBadRequest, "missing conversationId")
		return
	}

	var req updateRequest
	if err := json.NewDecoder(c.Request.Body).Decode(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "invalid request body")
		return
	}

	ctx := c.Request.Context()

	if err := h.db.UpdateConversation(ctx, convoID, req.Title, req.Model); err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	convo, err := h.db.GetConversation(ctx, convoID)
	if err != nil || convo == nil {
		response.Error(c, http.StatusNotFound, "conversation not found")
		return
	}

	c.JSON(http.StatusOK, convo)
}

func (h *Handler) Delete(c *router.Context) {
	convoID := c.Param("conversationId")
	if convoID == "" {
		response.Error(c, http.StatusBadRequest, "missing conversationId")
		return
	}

	ctx := c.Request.Context()
	h.chatStore.Delete(convoID)

	if err := h.db.DeleteConversation(ctx, convoID); err != nil {
		response.Error(c, http.StatusInternalServerError, err.Error())
		return
	}

	c.JSON(http.StatusOK, map[string]any{"ok": true})
}
