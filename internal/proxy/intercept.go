package proxy

import (
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type InterceptAction string

const (
	ActionForward InterceptAction = "forward"
	ActionModify  InterceptAction = "modify"
	ActionDrop    InterceptAction = "drop"
)

type InterceptRule struct {
	ID          string `json:"id"`
	Enabled     bool   `json:"enabled"`
	Host        string `json:"host,omitempty"`
	PathPattern string `json:"pathPattern,omitempty"`
	Method      string `json:"method,omitempty"`
	ContentType string `json:"contentType,omitempty"`
}

type InterceptDecision struct {
	RequestID       string            `json:"requestId"`
	Action          InterceptAction   `json:"action"`
	Method          *string           `json:"method,omitempty"`
	URL             *string           `json:"url,omitempty"`
	Headers         map[string]string `json:"headers,omitempty"`
	Body            *string           `json:"body,omitempty"`
	StatusCode      *int              `json:"statusCode,omitempty"`
	ResponseHeaders map[string]string `json:"responseHeaders,omitempty"`
	ResponseBody    *string           `json:"responseBody,omitempty"`
}

type PendingRequest struct {
	ID                   string            `json:"id"`
	Phase                string            `json:"phase"`
	Method               string            `json:"method"`
	URL                  string            `json:"url"`
	Headers              map[string]string `json:"headers"`
	Body                 *string           `json:"body,omitempty"`
	BodyEncoding         string            `json:"bodyEncoding,omitempty"`
	Timestamp            int64             `json:"timestamp"`
	StatusCode           int               `json:"statusCode,omitempty"`
	ResponseHeaders      map[string]string `json:"responseHeaders,omitempty"`
	ResponseBody         *string           `json:"responseBody,omitempty"`
	ResponseBodyEncoding string            `json:"responseBodyEncoding,omitempty"`
}

type interceptEntry struct {
	pending  PendingRequest
	req      *http.Request
	reqBody  []byte
	decision chan InterceptDecision
	timer    *time.Timer
}

type InterceptNotifier func(msgType string, payload any)

type InterceptEngine struct {
	mu       sync.RWMutex
	enabled  bool
	rules    []InterceptRule
	pending  map[string]*interceptEntry
	notifier InterceptNotifier
	timeout  time.Duration
	logger   *slog.Logger
}

func NewInterceptEngine(notifier InterceptNotifier, logger *slog.Logger) *InterceptEngine {
	return &InterceptEngine{
		pending:  make(map[string]*interceptEntry),
		notifier: notifier,
		timeout:  60 * time.Second,
		logger:   logger,
	}
}

func (ie *InterceptEngine) SetEnabled(enabled bool) {
	ie.mu.Lock()
	ie.enabled = enabled
	ie.mu.Unlock()
}

func (ie *InterceptEngine) IsEnabled() bool {
	ie.mu.RLock()
	defer ie.mu.RUnlock()
	return ie.enabled
}

func (ie *InterceptEngine) SetRules(rules []InterceptRule) {
	ie.mu.Lock()
	ie.rules = rules
	ie.mu.Unlock()
}

func (ie *InterceptEngine) GetRules() []InterceptRule {
	ie.mu.RLock()
	defer ie.mu.RUnlock()
	rules := make([]InterceptRule, len(ie.rules))
	copy(rules, ie.rules)
	return rules
}

func (ie *InterceptEngine) ListPending() []PendingRequest {
	ie.mu.RLock()
	defer ie.mu.RUnlock()
	result := make([]PendingRequest, 0, len(ie.pending))
	for _, entry := range ie.pending {
		result = append(result, entry.pending)
	}
	return result
}

func (ie *InterceptEngine) MaybeIntercept(req *http.Request, reqBody []byte) (*http.Request, []byte, bool) {
	ie.mu.RLock()
	if !ie.enabled {
		ie.mu.RUnlock()
		return req, reqBody, false
	}
	ie.mu.RUnlock()

	if !ie.matches(req) {
		return req, reqBody, false
	}

	id := generateID()
	reqHeaders := make(map[string]string)
	for k, v := range req.Header {
		reqHeaders[strings.ToLower(k)] = strings.Join(v, ", ")
	}
	if req.Host != "" {
		reqHeaders["host"] = req.Host
	}

	encBody, encoding := EncodeBody(reqBody)

	entry := &interceptEntry{
		pending: PendingRequest{
			ID:           id,
			Phase:        "request",
			Method:       req.Method,
			URL:          req.URL.String(),
			Headers:      reqHeaders,
			Body:         encBody,
			BodyEncoding: encoding,
			Timestamp:    time.Now().UnixMilli(),
		},
		req:      req,
		reqBody:  reqBody,
		decision: make(chan InterceptDecision, 1),
	}

	ie.mu.Lock()
	ie.pending[id] = entry
	entry.timer = time.AfterFunc(ie.timeout, func() {
		ie.mu.Lock()
		if _, ok := ie.pending[id]; ok {
			delete(ie.pending, id)
			entry.decision <- InterceptDecision{
				RequestID: id,
				Action:    ActionForward,
			}
			ie.logger.Info("intercept timeout, auto-forwarding", "request_id", id)
		}
		ie.mu.Unlock()
		ie.notifier("intercept_resolved", map[string]any{"id": id, "action": "timeout"})
	})
	ie.mu.Unlock()

	ie.notifier("intercept", entry.pending)

	dec := <-entry.decision
	entry.timer.Stop()

	switch dec.Action {
	case ActionDrop:
		return nil, nil, true
	case ActionModify:
		modReq, modBody := applyRequestModifications(req, reqBody, dec)
		return modReq, modBody, false
	default:
		return req, reqBody, false
	}
}

func (ie *InterceptEngine) Resolve(decision InterceptDecision) error {
	ie.mu.Lock()
	entry, ok := ie.pending[decision.RequestID]
	if !ok {
		ie.mu.Unlock()
		return fmt.Errorf("no pending request with id %s", decision.RequestID)
	}
	delete(ie.pending, decision.RequestID)
	ie.mu.Unlock()

	entry.timer.Stop()
	entry.decision <- decision

	ie.notifier("intercept_resolved", map[string]any{"id": decision.RequestID, "action": string(decision.Action)})
	return nil
}

func (ie *InterceptEngine) ResolveAll(action InterceptAction) {
	ie.mu.Lock()
	entries := make(map[string]*interceptEntry, len(ie.pending))
	for k, v := range ie.pending {
		entries[k] = v
	}
	ie.pending = make(map[string]*interceptEntry)
	ie.mu.Unlock()

	for id, entry := range entries {
		entry.timer.Stop()
		entry.decision <- InterceptDecision{
			RequestID: id,
			Action:    action,
		}
		ie.notifier("intercept_resolved", map[string]any{"id": id, "action": string(action)})
	}
}

func (ie *InterceptEngine) matches(req *http.Request) bool {
	ie.mu.RLock()
	defer ie.mu.RUnlock()

	if len(ie.rules) == 0 {
		return true
	}

	for _, rule := range ie.rules {
		if !rule.Enabled {
			continue
		}
		if rule.Method != "" && !strings.EqualFold(rule.Method, req.Method) {
			continue
		}
		if rule.Host != "" {
			hostname := req.URL.Hostname()
			matched, _ := filepath.Match(rule.Host, hostname)
			if !matched {
				continue
			}
		}
		if rule.PathPattern != "" {
			matched, _ := filepath.Match(rule.PathPattern, req.URL.Path)
			if !matched {
				continue
			}
		}
		if rule.ContentType != "" {
			ct := req.Header.Get("Content-Type")
			if !strings.Contains(strings.ToLower(ct), strings.ToLower(rule.ContentType)) {
				continue
			}
		}
		return true
	}
	return false
}

func (ie *InterceptEngine) MaybeInterceptResponse(req *http.Request, resp *http.Response, respBody []byte) ([]byte, int, http.Header, bool) {
	ie.mu.RLock()
	if !ie.enabled {
		ie.mu.RUnlock()
		return respBody, resp.StatusCode, resp.Header, false
	}
	ie.mu.RUnlock()

	if !ie.matches(req) {
		return respBody, resp.StatusCode, resp.Header, false
	}

	id := generateID()

	reqHeaders := make(map[string]string)
	for k, v := range req.Header {
		reqHeaders[strings.ToLower(k)] = strings.Join(v, ", ")
	}
	if req.Host != "" {
		reqHeaders["host"] = req.Host
	}

	respHeaders := make(map[string]string)
	for k, v := range resp.Header {
		respHeaders[strings.ToLower(k)] = strings.Join(v, ", ")
	}

	encBody, encoding := EncodeBody(respBody)

	entry := &interceptEntry{
		pending: PendingRequest{
			ID:                   id,
			Phase:                "response",
			Method:               req.Method,
			URL:                  req.URL.String(),
			Headers:              reqHeaders,
			Timestamp:            time.Now().UnixMilli(),
			StatusCode:           resp.StatusCode,
			ResponseHeaders:      respHeaders,
			ResponseBody:         encBody,
			ResponseBodyEncoding: encoding,
		},
		req:      req,
		reqBody:  nil,
		decision: make(chan InterceptDecision, 1),
	}

	ie.mu.Lock()
	ie.pending[id] = entry
	entry.timer = time.AfterFunc(ie.timeout, func() {
		ie.mu.Lock()
		if _, ok := ie.pending[id]; ok {
			delete(ie.pending, id)
			entry.decision <- InterceptDecision{
				RequestID: id,
				Action:    ActionForward,
			}
			ie.logger.Info("intercept timeout, auto-forwarding response", "request_id", id)
		}
		ie.mu.Unlock()
		ie.notifier("intercept_resolved", map[string]any{"id": id, "action": "timeout"})
	})
	ie.mu.Unlock()

	ie.notifier("intercept", entry.pending)

	dec := <-entry.decision
	entry.timer.Stop()

	switch dec.Action {
	case ActionDrop:
		return nil, 0, nil, true
	case ActionModify:
		modBody, modStatus, modHeaders := applyResponseModifications(resp, respBody, dec)
		return modBody, modStatus, modHeaders, false
	default:
		return respBody, resp.StatusCode, resp.Header, false
	}
}

func applyResponseModifications(resp *http.Response, respBody []byte, dec InterceptDecision) ([]byte, int, http.Header) {
	statusCode := resp.StatusCode
	headers := resp.Header.Clone()

	if dec.StatusCode != nil {
		statusCode = *dec.StatusCode
	}
	if dec.ResponseHeaders != nil {
		headers = make(http.Header)
		for k, v := range dec.ResponseHeaders {
			headers.Set(k, v)
		}
	}
	if dec.ResponseBody != nil {
		respBody = []byte(*dec.ResponseBody)
	}
	return respBody, statusCode, headers
}

func applyRequestModifications(req *http.Request, reqBody []byte, dec InterceptDecision) (*http.Request, []byte) {
	if dec.Method != nil {
		req.Method = *dec.Method
	}
	if dec.URL != nil {
		if u, err := url.Parse(*dec.URL); err == nil {
			req.URL = u
			req.Host = u.Host
		}
	}
	if dec.Headers != nil {
		req.Header = make(http.Header)
		for k, v := range dec.Headers {
			req.Header.Set(k, v)
		}
	}
	if dec.Body != nil {
		reqBody = []byte(*dec.Body)
	}
	return req, reqBody
}
