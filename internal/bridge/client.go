package bridge

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"sync/atomic"
	"time"
)

type Client struct {
	socketPath string
	nextID     atomic.Int64
}

func NewClient(socketPath string) *Client {
	return &Client{
		socketPath: socketPath,
	}
}

type rpcRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int64  `json:"id"`
	Method  string `json:"method"`
	Params  any    `json:"params,omitempty"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      int64           `json:"id"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func (c *Client) call(method string, params any) (json.RawMessage, error) {
	conn, err := net.Dial("unix", c.socketPath)
	if err != nil {
		return nil, fmt.Errorf("bridge.%s: %w", method, err)
	}
	defer conn.Close()

	req := rpcRequest{
		JSONRPC: "2.0",
		ID:      c.nextID.Add(1),
		Method:  method,
		Params:  params,
	}

	if err := json.NewEncoder(conn).Encode(req); err != nil {
		return nil, fmt.Errorf("bridge.%s: %w", method, err)
	}

	var resp rpcResponse
	if err := json.NewDecoder(conn).Decode(&resp); err != nil {
		return nil, fmt.Errorf("bridge.%s: %w", method, err)
	}

	if resp.Error != nil {
		return nil, fmt.Errorf("bridge.%s: %s", method, resp.Error.Message)
	}

	return resp.Result, nil
}

func (c *Client) Ping() (string, error) {
	raw, err := c.call("ping", nil)
	if err != nil {
		return "", err
	}

	var result string
	if err := json.Unmarshal(raw, &result); err != nil {
		return "", fmt.Errorf("bridge.Ping: %w", err)
	}

	return result, nil
}

func (c *Client) ListDevices() ([]Device, error) {
	raw, err := c.call("listDevices", nil)
	if err != nil {
		return nil, err
	}

	var devices []Device
	if err := json.Unmarshal(raw, &devices); err != nil {
		return nil, fmt.Errorf("bridge.ListDevices: %w", err)
	}

	return devices, nil
}

func (c *Client) ListApps(deviceID string) ([]App, error) {
	raw, err := c.call("listApps", map[string]string{"deviceId": deviceID})
	if err != nil {
		return nil, err
	}

	var apps []App
	if err := json.Unmarshal(raw, &apps); err != nil {
		return nil, fmt.Errorf("bridge.ListApps: %w", err)
	}

	return apps, nil
}

func (c *Client) ListProcesses(deviceID string) ([]Process, error) {
	raw, err := c.call("listProcesses", map[string]string{"deviceId": deviceID})
	if err != nil {
		return nil, err
	}

	var processes []Process
	if err := json.Unmarshal(raw, &processes); err != nil {
		return nil, fmt.Errorf("bridge.ListProcesses: %w", err)
	}

	return processes, nil
}

func (c *Client) GetDeviceInfo(deviceID string) (*DeviceInfo, error) {
	raw, err := c.call("getDeviceInfo", map[string]string{"deviceId": deviceID})
	if err != nil {
		return nil, err
	}

	var info DeviceInfo
	if err := json.Unmarshal(raw, &info); err != nil {
		return nil, fmt.Errorf("bridge.GetDeviceInfo: %w", err)
	}

	return &info, nil
}

func (c *Client) GetAppIcon(
	deviceID string,
	identifier string,
) ([]byte, string, error) {
	raw, err := c.call(
		"getAppIcon",
		map[string]string{"deviceId": deviceID, "identifier": identifier},
	)
	if err != nil {
		return nil, "", err
	}

	var icon AppIcon
	if err := json.Unmarshal(raw, &icon); err != nil {
		return nil, "", fmt.Errorf("bridge.GetAppIcon: %w", err)
	}

	data, err := base64.StdEncoding.DecodeString(icon.Data)
	if err != nil {
		return nil, "", fmt.Errorf("bridge.GetAppIcon: %w", err)
	}

	return data, icon.Format, nil
}

func (c *Client) Attach(
	deviceID string,
	identifier string,
	evasion *EvasionConfig,
) (*AttachResponse, error) {
	params := map[string]any{"deviceId": deviceID, "identifier": identifier}
	if evasion != nil {
		params["evasion"] = evasion
	}
	raw, err := c.call("attach", params)
	if err != nil {
		return nil, err
	}

	var resp AttachResponse
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, fmt.Errorf("bridge.Attach: %w", err)
	}

	return &resp, nil
}

func (c *Client) Detach(sessionID string) error {
	_, err := c.call("detach", map[string]string{"sessionId": sessionID})
	return err
}

func (c *Client) ListFiles(
	deviceID, bundleID, path string,
) ([]FileEntry, error) {
	raw, err := c.call(
		"listFiles",
		map[string]string{
			"deviceId": deviceID,
			"bundleId": bundleID,
			"path":     path,
		},
	)
	if err != nil {
		return nil, err
	}

	var entries []FileEntry
	if err := json.Unmarshal(raw, &entries); err != nil {
		return nil, fmt.Errorf("bridge.ListFiles: %w", err)
	}

	return entries, nil
}

func (c *Client) ReadFile(
	deviceID, bundleID, path string,
) (*FileContent, error) {
	raw, err := c.call(
		"readFile",
		map[string]string{
			"deviceId": deviceID,
			"bundleId": bundleID,
			"path":     path,
		},
	)
	if err != nil {
		return nil, err
	}

	var content FileContent
	if err := json.Unmarshal(raw, &content); err != nil {
		return nil, fmt.Errorf("bridge.ReadFile: %w", err)
	}

	return &content, nil
}

func (c *Client) FindFiles(
	deviceID, bundleID, pattern, basePath string,
) ([]string, error) {
	raw, err := c.call(
		"findFiles",
		map[string]any{
			"deviceId": deviceID,
			"bundleId": bundleID,
			"pattern":  pattern,
			"basePath": basePath,
		},
	)
	if err != nil {
		return nil, err
	}

	var paths []string
	if err := json.Unmarshal(raw, &paths); err != nil {
		return nil, fmt.Errorf("bridge.FindFiles: %w", err)
	}

	return paths, nil
}

func (c *Client) PullDatabase(
	deviceID, bundleID, dbPath string,
) (string, error) {
	raw, err := c.call(
		"pullDatabase",
		map[string]string{
			"deviceId": deviceID,
			"bundleId": bundleID,
			"dbPath":   dbPath,
		},
	)
	if err != nil {
		return "", err
	}

	var resp PullDatabaseResponse
	if err := json.Unmarshal(raw, &resp); err != nil {
		return "", fmt.Errorf("bridge.PullDatabase: %w", err)
	}

	return resp.LocalPath, nil
}

func (c *Client) RunScript(
	sessionID, code, name string,
	initialWaitSecs int,
) (*RunScriptResponse, error) {
	raw, err := c.call("runScript", map[string]any{
		"sessionId":   sessionID,
		"code":        code,
		"name":        name,
		"initialWait": initialWaitSecs,
	})
	if err != nil {
		return nil, err
	}

	var resp RunScriptResponse
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, fmt.Errorf("bridge.RunScript: %w", err)
	}

	return &resp, nil
}

func (c *Client) GetScriptOutput(
	sessionID, name string,
	since, limit int,
) (*GetScriptOutputResponse, error) {
	raw, err := c.call("getScriptOutput", map[string]any{
		"sessionId": sessionID,
		"name":      name,
		"since":     since,
		"limit":     limit,
	})
	if err != nil {
		return nil, err
	}

	var resp GetScriptOutputResponse
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, fmt.Errorf("bridge.GetScriptOutput: %w", err)
	}

	return &resp, nil
}

func (c *Client) StopScript(
	sessionID, name string,
) (*StopScriptResponse, error) {
	raw, err := c.call("stopScript", map[string]any{
		"sessionId": sessionID,
		"name":      name,
	})
	if err != nil {
		return nil, err
	}

	var resp StopScriptResponse
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, fmt.Errorf("bridge.StopScript: %w", err)
	}

	return &resp, nil
}

func (c *Client) AgentInvoke(
	sessionID, namespace, method string,
	args []any,
) (json.RawMessage, error) {
	return c.call("agentInvoke", map[string]any{
		"sessionId": sessionID,
		"namespace": namespace,
		"method":    method,
		"args":      args,
	})
}

func (c *Client) AgentInterfaces(
	sessionID string,
) (map[string][]string, error) {
	raw, err := c.call(
		"agentInterfaces",
		map[string]string{"sessionId": sessionID},
	)
	if err != nil {
		return nil, err
	}

	var result map[string][]string
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("bridge.AgentInterfaces: %w", err)
	}

	return result, nil
}

type SubscribeConn struct {
	Reader *bufio.Reader
	conn   net.Conn
}

func (s *SubscribeConn) Close() error {
	return s.conn.Close()
}

func (s *SubscribeConn) Read(p []byte) (int, error) {
	return s.Reader.Read(p)
}

var _ io.ReadCloser = (*SubscribeConn)(nil)

func (c *Client) Subscribe(sessionID string) (*SubscribeConn, error) {
	var conn net.Conn
	var err error
	for range 5 {
		conn, err = net.Dial("unix", c.socketPath)
		if err == nil {
			break
		}
		time.Sleep(500 * time.Millisecond)
	}
	if err != nil {
		return nil, fmt.Errorf("bridge.Subscribe: %w", err)
	}

	req := rpcRequest{
		JSONRPC: "2.0",
		ID:      c.nextID.Add(1),
		Method:  "subscribe",
		Params:  map[string]string{"sessionId": sessionID},
	}

	if err := json.NewEncoder(conn).Encode(req); err != nil {
		conn.Close()
		return nil, fmt.Errorf("bridge.Subscribe: %w", err)
	}

	// Use a bufio.Reader so we don't lose data buffered beyond the ack line
	reader := bufio.NewReaderSize(conn, 1024*1024)

	line, err := reader.ReadBytes('\n')
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("bridge.Subscribe: %w", err)
	}

	var resp rpcResponse
	if err := json.Unmarshal(line, &resp); err != nil {
		conn.Close()
		return nil, fmt.Errorf("bridge.Subscribe: %w", err)
	}

	if resp.Error != nil {
		conn.Close()
		return nil, fmt.Errorf("bridge.Subscribe: %s", resp.Error.Message)
	}

	return &SubscribeConn{Reader: reader, conn: conn}, nil
}
