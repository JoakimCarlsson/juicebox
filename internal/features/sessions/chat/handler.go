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

func (h *Handler) sqliteQueryFn() func(setup session.DeviceSetup, deviceID, bundleID, sessionID, dbPath, sqlStr string) (*chattools.QueryResult, error) {
	return func(setup session.DeviceSetup, deviceID, bundleID, sessionID, dbPath, sqlStr string) (*chattools.QueryResult, error) {
		resp, err := h.sqliteService.ExecQuery(
			setup,
			deviceID,
			bundleID,
			sessionID,
			dbPath,
			sqlStr,
		)
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
	deviceID string
	files    *scripting.FileManager
	buf      string
	applied  int
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
		f, err := ea.files.Get(ea.deviceID, filename)
		if err != nil || f == nil {
			return "", false
		}
		return f.Content, true
	}

	result := scripting.ApplyEdits(newBlocks, getContent)

	for _, applied := range result.Applied {
		_, _ = ea.files.Upsert(
			ea.deviceID,
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
	deviceID := c.Param("deviceId")
	if deviceID == "" {
		response.Error(c, http.StatusBadRequest, "missing deviceId")
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

	dc := h.manager.GetDeviceConnection(deviceID)
	if dc == nil {
		response.Error(c, http.StatusNotFound, "device not connected")
		return
	}

	var activeSess *session.Session
	var activeSessionID string
	if req.BundleID != "" {
		for _, sess := range dc.Sessions {
			if sess.BundleID == req.BundleID {
				activeSess = sess
				activeSessionID = sess.ID
				break
			}
		}
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

	hub := h.hubManager.GetOrCreate(deviceID)
	fileManager := scripting.NewFileManager(h.db, hub)

	setup := dc.Setup
	chatTools := []tool.BaseTool{
		chattools.NewGetRequestDetail(h.db),
		chattools.NewListProcesses(setup, deviceID),
		chattools.NewAttachApp(h.manager, deviceID),
		chattools.NewDetachApp(h.manager, deviceID),
		chattools.NewListScriptFiles(fileManager, deviceID),
		chattools.NewReadScriptFile(fileManager, deviceID),
		chattools.NewRunShell(),
		chattools.NewFetchWebpage(),
		chattools.NewWebSearch(),
	}

	if activeSessionID != "" {
		chatTools = append(chatTools,
			chattools.NewSearchTraffic(h.db, activeSessionID),
			chattools.NewListPendingRequests(h.manager, activeSessionID),
			chattools.NewModifyAndForward(h.manager, activeSessionID),
			chattools.NewForwardRequest(h.manager, activeSessionID),
			chattools.NewDropRequest(h.manager, activeSessionID),
		)
		for _, cap := range setup.Capabilities() {
			switch cap {
			case "logstream":
				chatTools = append(
					chatTools,
					chattools.NewRunLogcatQuery(h.db, activeSessionID),
				)
			case "frida":
				chatTools = append(
					chatTools,
					chattools.NewListClasses(h.manager, activeSessionID),
					chattools.NewGetClassDetail(h.manager, activeSessionID),
					chattools.NewGetCrashes(h.db, activeSessionID),
					chattools.NewGetCryptoEvents(h.db, activeSessionID),
					chattools.NewGetClipboardEvents(h.db, activeSessionID),
					chattools.NewListKeystoreEntries(
						h.manager,
						activeSessionID,
					),
					chattools.NewListSharedPreferences(
						h.manager,
						activeSessionID,
					),
					chattools.NewRunFridaScript(
						h.runner,
						activeSessionID,
						deviceID,
					),
					chattools.NewGetScriptOutput(h.runner, activeSessionID),
					chattools.NewStopFridaScript(
						h.runner,
						activeSessionID,
						deviceID,
					),
					chattools.NewScanMemory(h.manager, activeSessionID),
				)
			}
		}
		chatTools = append(
			chatTools,
			chattools.NewLs(setup, deviceID, activeSess.BundleID),
			chattools.NewReadFile(setup, deviceID, activeSess.BundleID),
			chattools.NewFindFiles(setup, deviceID, activeSess.BundleID),
			chattools.NewListDatabases(setup, deviceID, activeSess.BundleID),
			chattools.NewGetSchema(h.sqliteService, h.manager, activeSessionID),
			chattools.NewSqliteQuery(
				h.sqliteQueryFn(),
				h.manager,
				activeSessionID,
			),
		)
	} else {
		for _, cap := range setup.Capabilities() {
			switch cap {
			case "logstream":
				chatTools = append(
					chatTools,
					chattools.NewRunLogcatQuery(h.db, ""),
				)
			}
		}
	}

	state := map[string]any{
		"BundleID":  req.BundleID,
		"DeviceID":  deviceID,
		"SessionID": activeSessionID,
	}

	a := agent.New(llmClient,
		agent.WithSystemPrompt(SystemPromptTemplate),
		agent.WithState(state),
		agent.WithTools(chatTools...),
		agent.WithSession(deviceID, h.chatStore.GetOrCreate(deviceID)),
		agent.WithMaxIterations(50),
	)

	c.SSEHandler(
		router.DefaultSSEConfig(),
		func(ctx context.Context, send router.SSESendFunc) error {
			eventCh := a.ChatStream(ctx, req.Message)

			applier := &editApplier{
				deviceID: deviceID,
				files:    fileManager,
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
	deviceID := c.Param("deviceId")
	if deviceID == "" {
		response.Error(c, http.StatusBadRequest, "missing deviceId")
		return
	}

	store := h.chatStore.GetOrCreate(deviceID)
	ctx := c.Request.Context()

	exists, err := store.Exists(ctx, deviceID)
	if err != nil || !exists {
		c.JSON(http.StatusOK, map[string]any{"messages": []any{}})
		return
	}

	sess, err := store.Load(ctx, deviceID)
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
