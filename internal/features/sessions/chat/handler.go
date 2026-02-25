package chat

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/message"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/ai/types"
	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/config"
	"github.com/joakimcarlsson/juicebox/internal/db"
	"github.com/joakimcarlsson/juicebox/internal/devicehub"
	chattools "github.com/joakimcarlsson/juicebox/internal/features/sessions/chat/tools"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/sqlite"
	"github.com/joakimcarlsson/juicebox/internal/response"
	"github.com/joakimcarlsson/juicebox/internal/scripting"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type Handler struct {
	db            *db.DB
	manager       *session.Manager
	llmConfig     *config.LLMConfig
	chatStore     *ChatSessionStore
	sqliteService *sqlite.Service
	hubManager    *devicehub.Manager
	runner        *scripting.Runner
}

func NewHandler(
	database *db.DB,
	manager *session.Manager,
	llmConfig *config.LLMConfig,
	chatStore *ChatSessionStore,
	sqliteService *sqlite.Service,
	hubManager *devicehub.Manager,
	runner *scripting.Runner,
) *Handler {
	return &Handler{
		db:            database,
		manager:       manager,
		llmConfig:     llmConfig,
		chatStore:     chatStore,
		sqliteService: sqliteService,
		hubManager:    hubManager,
		runner:        runner,
	}
}

func (h *Handler) sqliteQueryFn() func(sess *session.Session, sessionID, dbPath, sqlStr string) (*chattools.QueryResult, error) {
	return func(sess *session.Session, sessionID, dbPath, sqlStr string) (*chattools.QueryResult, error) {
		resp, err := h.sqliteService.ExecQuery(sess, sessionID, dbPath, sqlStr)
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

type editApplier struct {
	sessionID string
	files     *scripting.FileManager
	buf       string
	applied   int
}

func (ea *editApplier) accumulate(delta string) {
	ea.buf += delta
}

func (ea *editApplier) flush() string {
	blocks := scripting.ParseEditBlocks(ea.buf)
	if len(blocks) <= ea.applied {
		return ""
	}

	newBlocks := blocks[ea.applied:]

	getContent := func(filename string) (string, bool) {
		f, err := ea.files.Get(ea.sessionID, filename)
		if err != nil || f == nil {
			return "", false
		}
		return f.Content, true
	}

	result := scripting.ApplyEdits(newBlocks, getContent)

	for _, applied := range result.Applied {
		_, _ = ea.files.Upsert(
			ea.sessionID,
			applied.Block.Filename,
			applied.NewContent,
		)
	}

	ea.applied = len(blocks)

	if len(result.Failed) > 0 {
		return scripting.BuildEditError(result, getContent)
	}

	return ""
}

func (h *Handler) Handle(c *router.Context) {
	sessionID := c.Param("sessionId")
	if sessionID == "" {
		response.Error(c, http.StatusBadRequest, "missing sessionId")
		return
	}

	if !h.llmConfig.Configured() {
		response.Error(
			c,
			http.StatusServiceUnavailable,
			"LLM provider not configured. Set JUICEBOX_LLM_PROVIDER and JUICEBOX_LLM_API_KEY environment variables.",
		)
		return
	}

	var req chatRequest
	if err := json.NewDecoder(c.Request.Body).Decode(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Message == "" {
		response.Error(c, http.StatusBadRequest, "message is required")
		return
	}

	dbSess, err := h.db.GetSession(sessionID)
	if err != nil || dbSess == nil {
		response.Error(c, http.StatusNotFound, "session not found")
		return
	}

	liveSess := h.manager.GetSession(sessionID)
	if liveSess == nil {
		response.Error(c, http.StatusNotFound, "active session not found")
		return
	}

	llmClient, err := h.llmConfig.NewClient()
	if err != nil {
		response.Error(
			c,
			http.StatusInternalServerError,
			"failed to create LLM client: "+err.Error(),
		)
		return
	}

	hub := h.hubManager.GetOrCreate(dbSess.DeviceID)
	fileManager := scripting.NewFileManager(h.db, hub)

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
			sessionTools = append(
				sessionTools,
				chattools.NewRunLogcatQuery(h.db, sessionID),
			)
		case "frida":
			sessionTools = append(sessionTools,
				chattools.NewListClasses(h.manager, sessionID),
				chattools.NewGetClassDetail(h.manager, sessionID),
				chattools.NewGetCrashes(h.db, sessionID),
				chattools.NewGetCryptoEvents(h.db, sessionID),
				chattools.NewGetClipboardEvents(h.db, sessionID),
				chattools.NewListKeystoreEntries(h.manager, sessionID),
				chattools.NewListSharedPreferences(h.manager, sessionID),
				chattools.NewRunFridaScript(h.runner, sessionID),
				chattools.NewGetScriptOutput(h.runner, sessionID),
				chattools.NewStopFridaScript(h.runner, sessionID),
				chattools.NewListScriptFiles(fileManager, sessionID),
				chattools.NewReadScriptFile(fileManager, sessionID),
				chattools.NewScanMemory(h.manager, sessionID),
			)
		}
	}
	sessionTools = append(sessionTools,
		chattools.NewLs(setup, dbSess.DeviceID, dbSess.BundleID),
		chattools.NewReadFile(setup, dbSess.DeviceID, dbSess.BundleID),
		chattools.NewFindFiles(setup, dbSess.DeviceID, dbSess.BundleID),
		chattools.NewListDatabases(setup, dbSess.DeviceID, dbSess.BundleID),
		chattools.NewGetSchema(h.sqliteService, h.manager, sessionID),
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
		agent.WithMaxIterations(50),
	)

	c.SSEHandler(
		router.DefaultSSEConfig(),
		func(ctx context.Context, send router.SSESendFunc) error {
			eventCh := a.ChatStream(ctx, req.Message)

			applier := &editApplier{
				sessionID: sessionID,
				files:     fileManager,
			}

			for event := range eventCh {
				switch event.Type {
				case types.EventContentDelta:
					applier.accumulate(event.Content)
					if err := send("content", sseContentEvent{Delta: event.Content}); err != nil {
						return err
					}

				case types.EventToolUseStart:
					if editErr := applier.flush(); editErr != "" {
						_ = send(
							"edit_failed",
							sseEditResultEvent{Error: editErr},
						)
					} else if applier.applied > 0 {
						_ = send("edit_applied", sseEditResultEvent{Success: true})
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
					if editErr := applier.flush(); editErr != "" {
						_ = send(
							"edit_failed",
							sseEditResultEvent{Error: editErr},
						)
					} else if applier.applied > 0 {
						_ = send("edit_applied", sseEditResultEvent{Success: true})
					}

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
		},
	)
}

func (h *Handler) Status(c *router.Context) {
	c.JSON(http.StatusOK, map[string]any{
		"configured": h.llmConfig.Configured(),
	})
}

func (h *Handler) History(c *router.Context) {
	sessionID := c.Param("sessionId")
	if sessionID == "" {
		response.Error(c, http.StatusBadRequest, "missing sessionId")
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
		response.Error(c, http.StatusInternalServerError, err.Error())
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
		result = append(
			result,
			historyMsg{Role: "assistant", Content: text, Parts: parts},
		)
	}

	c.JSON(http.StatusOK, map[string]any{"messages": result})
}
