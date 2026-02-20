package stream

import (
	"bufio"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/bridge"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Handler struct {
	client *bridge.Client
}

func NewHandler(client *bridge.Client) *Handler {
	return &Handler{client: client}
}

func (h *Handler) Handle(c *router.Context) {
	sessionId := c.Param("sessionId")
	if sessionId == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "missing sessionId"})
		return
	}

	log.Printf("[stream] upgrading WebSocket for session %s", sessionId)

	ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[stream] WebSocket upgrade failed: %v", err)
		return
	}
	defer ws.Close()

	log.Printf("[stream] subscribing to session %s", sessionId)
	sub, err := h.client.Subscribe(sessionId)
	if err != nil {
		log.Printf("[stream] subscribe failed: %v", err)
		ws.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseInternalServerErr, err.Error()))
		return
	}
	defer sub.Close()

	log.Printf("[stream] connected, relaying events for session %s", sessionId)

	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			if _, _, err := ws.ReadMessage(); err != nil {
				return
			}
		}
	}()

	scanner := bufio.NewScanner(sub.Reader)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

	for scanner.Scan() {
		select {
		case <-done:
			return
		default:
		}

		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		log.Printf("[stream] relaying: %s", string(line)[:min(len(line), 100)])
		if err := ws.WriteMessage(websocket.TextMessage, line); err != nil {
			log.Printf("[stream] WebSocket write error: %v", err)
			return
		}
	}

	if err := scanner.Err(); err != nil {
		log.Printf("[stream] scanner error: %v", err)
	}
	log.Printf("[stream] session %s stream ended", sessionId)
}
