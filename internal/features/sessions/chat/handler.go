package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/message"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/ai/types"
	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/config"
	"github.com/joakimcarlsson/juicebox/internal/db"
	"github.com/joakimcarlsson/juicebox/internal/devicehub"
	chattools "github.com/joakimcarlsson/juicebox/internal/features/sessions/chat/tools"
	sqlitepkg "github.com/joakimcarlsson/juicebox/internal/features/sessions/sqlite"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type Handler struct {
	db            *db.DB
	manager       *session.Manager
	llmConfig     *config.LLMConfig
	chatStore     *ChatSessionStore
	sqliteHandler *sqlitepkg.Handler
	hubManager    *devicehub.Manager
}

func NewHandler(database *db.DB, manager *session.Manager, llmConfig *config.LLMConfig, chatStore *ChatSessionStore, sqliteHandler *sqlitepkg.Handler, hubManager *devicehub.Manager) *Handler {
	return &Handler{
		db:            database,
		manager:       manager,
		llmConfig:     llmConfig,
		chatStore:     chatStore,
		sqliteHandler: sqliteHandler,
		hubManager:    hubManager,
	}
}

func (h *Handler) sqliteQueryFn() func(sess *session.Session, sessionID, dbPath, sqlStr string) (*chattools.QueryResult, error) {
	return func(sess *session.Session, sessionID, dbPath, sqlStr string) (*chattools.QueryResult, error) {
		resp, err := h.sqliteHandler.ExecQuery(sess, sessionID, dbPath, sqlStr)
		if err != nil {
			return nil, err
		}
		return &chattools.QueryResult{
			Columns:  resp.Columns,
			Rows:     resp.Rows,
			RowCount: resp.RowCount,
		}, nil
	}
}

type chatRequest struct {
	Message string `json:"message"`
}

type sseContentEvent struct {
	Delta string `json:"delta"`
}

type sseToolStartEvent struct {
	Name string `json:"name"`
	ID   string `json:"id"`
}

type sseToolEndEvent struct {
	Name   string `json:"name"`
	ID     string `json:"id"`
	Result string `json:"result"`
}

type sseDoneEvent struct {
	InputTokens  int64 `json:"input_tokens"`
	OutputTokens int64 `json:"output_tokens"`
}

type sseErrorEvent struct {
	Message string `json:"message"`
}

func (h *Handler) Handle(c *router.Context) {
	sessionID := c.Param("sessionId")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "missing sessionId"})
		return
	}

	if !h.llmConfig.Configured() {
		c.JSON(http.StatusServiceUnavailable, map[string]string{
			"error": "LLM provider not configured. Set JUICEBOX_LLM_PROVIDER and JUICEBOX_LLM_API_KEY environment variables.",
		})
		return
	}

	var req chatRequest
	if err := json.NewDecoder(c.Request.Body).Decode(&req); err != nil {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if req.Message == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "message is required"})
		return
	}

	dbSess, err := h.db.GetSession(sessionID)
	if err != nil || dbSess == nil {
		c.JSON(http.StatusNotFound, map[string]string{"error": "session not found"})
		return
	}

	liveSess := h.manager.GetSession(sessionID)
	if liveSess == nil {
		c.JSON(http.StatusNotFound, map[string]string{"error": "active session not found"})
		return
	}

	llmClient, err := h.llmConfig.NewClient()
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create LLM client: " + err.Error()})
		return
	}

	setup := liveSess.Setup
	sessionTools := []tool.BaseTool{
		chattools.NewSearchTraffic(h.db, sessionID),
		chattools.NewGetRequestDetail(h.db),
		chattools.NewListProcesses(setup, dbSess.DeviceID),
		chattools.NewListPendingRequests(h.manager, sessionID),
		chattools.NewModifyAndForward(h.manager, sessionID),
		chattools.NewForwardRequest(h.manager, sessionID),
		chattools.NewDropRequest(h.manager, sessionID),
	}
	for _, cap := range setup.Capabilities() {
		switch cap {
		case "logstream":
			sessionTools = append(sessionTools, chattools.NewRunLogcatQuery(h.db, sessionID))
		case "frida":
			sessionTools = append(sessionTools,
				chattools.NewListClasses(h.manager, sessionID),
				chattools.NewGetClassDetail(h.manager, sessionID),
				chattools.NewGetCrashes(h.db, sessionID),
				chattools.NewGetCryptoEvents(h.db, sessionID),
				chattools.NewListKeystoreEntries(h.manager, sessionID),
				chattools.NewListSharedPreferences(h.manager, sessionID),
				chattools.NewRunFridaScript(h.manager, h.db, sessionID),
				chattools.NewListScriptFiles(h.db, sessionID),
				chattools.NewReadScriptFile(h.db, sessionID),
			)
		}
	}
	sessionTools = append(sessionTools,
		chattools.NewLs(setup, dbSess.DeviceID, dbSess.BundleID),
		chattools.NewReadFile(setup, dbSess.DeviceID, dbSess.BundleID),
		chattools.NewFindFiles(setup, dbSess.DeviceID, dbSess.BundleID),
		chattools.NewListDatabases(setup, dbSess.DeviceID, dbSess.BundleID),
		chattools.NewGetSchema(h.sqliteHandler, h.manager, sessionID),
		chattools.NewSqliteQuery(h.sqliteQueryFn(), h.manager, sessionID),
	)

	state := map[string]any{
		"BundleID":  dbSess.BundleID,
		"DeviceID":  dbSess.DeviceID,
		"SessionID": sessionID,
	}

	a := agent.New(llmClient,
		agent.WithSystemPrompt(SystemPromptTemplate),
		agent.WithState(state),
		agent.WithTools(sessionTools...),
		agent.WithSession(sessionID, h.chatStore.GetOrCreate(sessionID)),
		agent.WithMaxIterations(5),
	)

	hub := h.hubManager.GetOrCreate(dbSess.DeviceID)

	c.SSEHandler(router.DefaultSSEConfig(), func(ctx context.Context, send router.SSESendFunc) error {
		eventCh := a.ChatStream(ctx, req.Message)

		var fullContent string
		var fileBlocksSaved bool

		for event := range eventCh {
			switch event.Type {
			case types.EventContentDelta:
				fullContent += event.Content
				if err := send("content", sseContentEvent{Delta: event.Content}); err != nil {
					return err
				}

			case types.EventToolUseStart:
				if !fileBlocksSaved {
					processFileBlocks(fullContent, sessionID, h.db, hub)
					fileBlocksSaved = true
				}
				if event.ToolCall != nil {
					if err := send("tool_start", sseToolStartEvent{
						Name: event.ToolCall.Name,
						ID:   event.ToolCall.ID,
					}); err != nil {
						return err
					}
				}

			case types.EventToolUseStop:
				if event.ToolResult != nil {
					if err := send("tool_end", sseToolEndEvent{
						Name:   event.ToolResult.ToolName,
						ID:     event.ToolResult.ToolCallID,
						Result: event.ToolResult.Output,
					}); err != nil {
						return err
					}
				}

			case types.EventComplete:
				if !fileBlocksSaved {
					processFileBlocks(fullContent, sessionID, h.db, hub)
				}
				fullContent = ""
				fileBlocksSaved = false

				evt := sseDoneEvent{}
				if event.Response != nil {
					evt.InputTokens = event.Response.Usage.InputTokens
					evt.OutputTokens = event.Response.Usage.OutputTokens
				}
				return send("done", evt)

			case types.EventError:
				errMsg := "unknown error"
				if event.Error != nil {
					errMsg = event.Error.Error()
				}
				return send("error", sseErrorEvent{Message: errMsg})
			}
		}

		return nil
	})
}

var (
	fileWriteRe     = regexp.MustCompile(`(?s)<file-write\s+src="([^"]+)">\n?(.*?)</file-write>`)
	fileEditRe      = regexp.MustCompile(`(?s)<file-edit\s+src="([^"]+)">\n?(.*?)</file-edit>`)
	searchReplaceRe = regexp.MustCompile(`(?s)<<<<<<< SEARCH\n(.*?)\n=======\n(.*?)\n>>>>>>> REPLACE`)
)

func processFileBlocks(content, sessionID string, store *db.DB, hub *devicehub.Hub) {
	now := time.Now().UnixMilli()

	for _, match := range fileWriteRe.FindAllStringSubmatch(content, -1) {
		name, code := match[1], match[2]
		fileID := fmt.Sprintf("sf_%d", time.Now().UnixNano())
		_ = store.UpsertScriptFile(db.ScriptFileRow{
			ID:        fileID,
			SessionID: sessionID,
			Name:      name,
			Content:   code,
			CreatedAt: now,
			UpdatedAt: now,
		})
		payload, _ := json.Marshal(map[string]string{"name": name})
		if data, err := devicehub.Marshal("file_write", sessionID, json.RawMessage(payload)); err == nil {
			hub.Broadcast(data)
		}
	}

	for _, match := range fileEditRe.FindAllStringSubmatch(content, -1) {
		name, body := match[1], match[2]
		file, err := store.GetScriptFile(sessionID, name)
		if err != nil || file == nil {
			continue
		}

		updated := file.Content
		for _, sr := range searchReplaceRe.FindAllStringSubmatch(body, -1) {
			search, replace := sr[1], sr[2]
			if !strings.Contains(updated, search) {
				continue
			}
			updated = strings.Replace(updated, search, replace, 1)
		}

		_ = store.UpsertScriptFile(db.ScriptFileRow{
			ID:        file.ID,
			SessionID: sessionID,
			Name:      name,
			Content:   updated,
			CreatedAt: file.CreatedAt,
			UpdatedAt: now,
		})
		payload, _ := json.Marshal(map[string]string{"name": name})
		if data, err := devicehub.Marshal("file_write", sessionID, json.RawMessage(payload)); err == nil {
			hub.Broadcast(data)
		}
	}
}

func (h *Handler) Status(c *router.Context) {
	c.JSON(http.StatusOK, map[string]any{
		"configured": h.llmConfig.Configured(),
	})
}

func (h *Handler) History(c *router.Context) {
	sessionID := c.Param("sessionId")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, map[string]string{"error": "missing sessionId"})
		return
	}

	store := h.chatStore.GetOrCreate(sessionID)
	ctx := c.Request.Context()

	exists, err := store.Exists(ctx, sessionID)
	if err != nil || !exists {
		c.JSON(http.StatusOK, map[string]any{"messages": []any{}})
		return
	}

	sess, err := store.Load(ctx, sessionID)
	if err != nil || sess == nil {
		c.JSON(http.StatusOK, map[string]any{"messages": []any{}})
		return
	}

	msgs, err := sess.GetMessages(ctx, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	toolResults := make(map[string]message.ToolResult)
	for _, m := range msgs {
		if m.Role == message.Tool {
			for _, tr := range m.ToolResults() {
				toolResults[tr.ToolCallID] = tr
			}
		}
	}

	type historyPart struct {
		Type    string `json:"type"`
		Content string `json:"content,omitempty"`
		ID      string `json:"id,omitempty"`
		Name    string `json:"name,omitempty"`
		Status  string `json:"status,omitempty"`
		Result  string `json:"result,omitempty"`
	}

	type historyMsg struct {
		Role    string        `json:"role"`
		Content string        `json:"content"`
		Parts   []historyPart `json:"parts,omitempty"`
	}

	result := make([]historyMsg, 0)
	for _, m := range msgs {
		if m.Role == message.System || m.Role == message.Tool {
			continue
		}

		text := ""
		for _, p := range m.Parts {
			if tp, ok := p.(message.TextContent); ok {
				text += tp.Text
			}
		}

		if m.Role == message.User {
			if text == "" {
				continue
			}
			result = append(result, historyMsg{Role: "user", Content: text})
			continue
		}

		var parts []historyPart
		for _, p := range m.Parts {
			switch v := p.(type) {
			case message.TextContent:
				if v.Text != "" {
					parts = append(parts, historyPart{Type: "text", Content: v.Text})
				}
			case message.ToolCall:
				hp := historyPart{
					Type:   "tool_call",
					ID:     v.ID,
					Name:   v.Name,
					Status: "done",
				}
				if tr, ok := toolResults[v.ID]; ok {
					hp.Result = tr.Content
				}
				parts = append(parts, hp)
			}
		}

		if text == "" && len(parts) == 0 {
			continue
		}
		result = append(result, historyMsg{Role: "assistant", Content: text, Parts: parts})
	}

	c.JSON(http.StatusOK, map[string]any{"messages": result})
}
