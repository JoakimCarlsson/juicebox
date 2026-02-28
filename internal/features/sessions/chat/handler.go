package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/message"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/ai/types"
	"github.com/joakimcarlsson/go-router/router"
	"github.com/joakimcarlsson/juicebox/internal/bridge"
	"github.com/joakimcarlsson/juicebox/internal/db"
	"github.com/joakimcarlsson/juicebox/internal/devicehub"
	chattools "github.com/joakimcarlsson/juicebox/internal/features/sessions/chat/tools"
	"github.com/joakimcarlsson/juicebox/internal/features/sessions/sqlite"
	"github.com/joakimcarlsson/juicebox/internal/response"
	"github.com/joakimcarlsson/juicebox/internal/scripting"
	"github.com/joakimcarlsson/juicebox/internal/session"
	"github.com/joakimcarlsson/squeeze"
)

type Handler struct {
	db            *db.DB
	manager       *session.Manager
	chatStore     *ChatSessionStore
	sqliteService *sqlite.Service
	hubManager    *devicehub.Manager
	runner        *scripting.Runner
}

func NewHandler(
	database *db.DB,
	manager *session.Manager,
	chatStore *ChatSessionStore,
	sqliteService *sqlite.Service,
	hubManager *devicehub.Manager,
	runner *scripting.Runner,
) *Handler {
	return &Handler{
		db:            database,
		manager:       manager,
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

const autoLintPrefix = "[auto-lint] "
const maxLintRetries = 3

type editApplier struct {
	deviceID      string
	files         *scripting.FileManager
	buf           string
	applied       int
	modifiedFiles []string
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
		ea.modifiedFiles = append(ea.modifiedFiles, applied.Block.Filename)
	}

	ea.applied = len(blocks)

	if len(result.Failed) > 0 {
		return scripting.BuildEditError(result, getContent)
	}

	return ""
}

func (ea *editApplier) reset() {
	ea.buf = ""
	ea.applied = 0
	ea.modifiedFiles = nil
}

func (ea *editApplier) scriptFiles() []string {
	var scripts []string
	seen := make(map[string]bool)
	for _, f := range ea.modifiedFiles {
		ext := filepath.Ext(f)
		if (ext == ".ts" || ext == ".js") && !seen[f] {
			seen[f] = true
			scripts = append(scripts, f)
		}
	}
	return scripts
}

type scriptFileGetter interface {
	Get(deviceID, name string) (*scripting.ScriptFile, error)
}

type scriptCompiler interface {
	CompileScript(code string) (*bridge.CompileResult, error)
}

func compileModifiedScripts(
	bc scriptCompiler,
	fm scriptFileGetter,
	deviceID string,
	filenames []string,
) string {
	var errs []string
	for _, name := range filenames {
		f, err := fm.Get(deviceID, name)
		if err != nil || f == nil {
			continue
		}
		_, err = bc.CompileScript(f.Content)
		if err != nil {
			errs = append(errs, fmt.Sprintf("**%s**: %s", name, err.Error()))
		}
	}
	if len(errs) == 0 {
		return ""
	}
	return "Script compilation failed. Fix the errors:\n\n" + strings.Join(
		errs,
		"\n\n",
	)
}

func (h *Handler) Handle(c *router.Context) {
	deviceID := c.Param("deviceId")
	if deviceID == "" {
		response.Error(c, http.StatusBadRequest, "missing deviceId")
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
	if req.Model == "" {
		response.Error(c, http.StatusBadRequest, "model is required")
		return
	}
	if req.ConversationID == "" {
		response.Error(c, http.StatusBadRequest, "conversationId is required")
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

	llmClient, err := newLLMClient(c.Request.Context(), h.db, req.Model)
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

	a := squeeze.NewAgent(llmClient,
		squeeze.WithTools(chatTools...),
		squeeze.WithAgentOptions(
			agent.WithSystemPrompt(SystemPromptTemplate),
			agent.WithState(state),
			agent.WithSession(
				req.ConversationID,
				h.chatStore.GetOrCreate(req.ConversationID),
			),
		),
	)

	bridgeClient := h.manager.Bridge()

	convoID := req.ConversationID
	userMsg := req.Message

	c.SSEHandler(
		router.DefaultSSEConfig(),
		func(ctx context.Context, send router.SSESendFunc) error {
			msg := userMsg
			totalUsage := sseDoneEvent{}

			for attempt := range maxLintRetries + 1 {
				applier := &editApplier{
					deviceID: deviceID,
					files:    fileManager,
				}

				var streamErr error
				var complete bool

				for event := range a.ChatStream(ctx, msg) {
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
						if event.Response != nil {
							totalUsage.InputTokens += event.Response.Usage.InputTokens
							totalUsage.OutputTokens += event.Response.Usage.OutputTokens
						}
						complete = true

					case types.EventError:
						errMsg := "unknown error"
						if event.Error != nil {
							errMsg = event.Error.Error()
						}
						streamErr = fmt.Errorf("%s", errMsg)
					}
				}

				if streamErr != nil {
					return send(
						"error",
						sseErrorEvent{Message: streamErr.Error()},
					)
				}
				if !complete {
					return send("done", totalUsage)
				}

				scripts := applier.scriptFiles()
				if len(scripts) == 0 || attempt == maxLintRetries {
					return send("done", totalUsage)
				}

				compileErr := compileModifiedScripts(
					bridgeClient,
					fileManager,
					deviceID,
					scripts,
				)
				if compileErr == "" {
					return send("done", totalUsage)
				}

				slog.Info("auto-lint retry",
					"attempt", attempt+1,
					"device", deviceID,
					"scripts", scripts,
				)
				_ = send(
					"content",
					sseContentEvent{
						Delta: "\n\n---\n*Compilation error detected, retrying...*\n\n",
					},
				)
				msg = autoLintPrefix + compileErr
			}

			h.autoNameConversation(ctx, convoID, userMsg)
			return send("done", totalUsage)
		},
	)
}

func (h *Handler) autoNameConversation(
	ctx context.Context,
	convoID, userMsg string,
) {
	convo, err := h.db.GetConversation(ctx, convoID)
	if err != nil || convo == nil {
		return
	}
	if convo.Title != "" {
		_ = h.db.TouchConversation(ctx, convoID)
		return
	}
	title := userMsg
	if len(title) > 50 {
		title = title[:50] + "..."
	}
	t := title
	_ = h.db.UpdateConversation(ctx, convoID, &t, nil)
}

func (h *Handler) Status(c *router.Context) {
	ctx := c.Request.Context()
	c.JSON(http.StatusOK, map[string]any{
		"configured": hasAnyProviderKey(ctx, h.db),
	})
}

func (h *Handler) History(c *router.Context) {
	conversationID := c.Request.URL.Query().Get("conversationId")
	if conversationID == "" {
		c.JSON(http.StatusOK, map[string]any{"messages": []any{}})
		return
	}

	store := h.chatStore.GetOrCreate(conversationID)
	ctx := c.Request.Context()

	exists, err := store.Exists(ctx, conversationID)
	if err != nil || !exists {
		c.JSON(http.StatusOK, map[string]any{"messages": []any{}})
		return
	}

	sess, err := store.Load(ctx, conversationID)
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
			if text == "" || strings.HasPrefix(text, autoLintPrefix) {
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
