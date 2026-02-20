package bridge

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"sync/atomic"
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

func (c *Client) ListApps(deviceId string) ([]App, error) {
	raw, err := c.call("listApps", map[string]string{"deviceId": deviceId})
	if err != nil {
		return nil, err
	}

	var apps []App
	if err := json.Unmarshal(raw, &apps); err != nil {
		return nil, fmt.Errorf("bridge.ListApps: %w", err)
	}

	return apps, nil
}

func (c *Client) ListProcesses(deviceId string) ([]Process, error) {
	raw, err := c.call("listProcesses", map[string]string{"deviceId": deviceId})
	if err != nil {
		return nil, err
	}

	var processes []Process
	if err := json.Unmarshal(raw, &processes); err != nil {
		return nil, fmt.Errorf("bridge.ListProcesses: %w", err)
	}

	return processes, nil
}

func (c *Client) GetDeviceInfo(deviceId string) (*DeviceInfo, error) {
	raw, err := c.call("getDeviceInfo", map[string]string{"deviceId": deviceId})
	if err != nil {
		return nil, err
	}

	var info DeviceInfo
	if err := json.Unmarshal(raw, &info); err != nil {
		return nil, fmt.Errorf("bridge.GetDeviceInfo: %w", err)
	}

	return &info, nil
}

func (c *Client) GetAppIcon(deviceId string, identifier string) ([]byte, string, error) {
	raw, err := c.call("getAppIcon", map[string]string{"deviceId": deviceId, "identifier": identifier})
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

func (c *Client) Attach(deviceId string, identifier string) (*AttachResponse, error) {
	raw, err := c.call("attach", map[string]string{"deviceId": deviceId, "identifier": identifier})
	if err != nil {
		return nil, err
	}

	var resp AttachResponse
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, fmt.Errorf("bridge.Attach: %w", err)
	}

	return &resp, nil
}

func (c *Client) Detach(sessionId string) error {
	_, err := c.call("detach", map[string]string{"sessionId": sessionId})
	return err
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

func (c *Client) Subscribe(sessionId string) (*SubscribeConn, error) {
	conn, err := net.Dial("unix", c.socketPath)
	if err != nil {
		return nil, fmt.Errorf("bridge.Subscribe: %w", err)
	}

	req := rpcRequest{
		JSONRPC: "2.0",
		ID:      c.nextID.Add(1),
		Method:  "subscribe",
		Params:  map[string]string{"sessionId": sessionId},
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
