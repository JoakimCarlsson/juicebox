package bridge

import (
	"encoding/json"
	"fmt"
	"net"
)

type Client struct {
	socketPath string
}

func NewClient(socketPath string) *Client {
	return &Client{
		socketPath: socketPath,
	}
}

func (c *Client) Ping() (string, error) {
	conn, err := net.Dial("unix", c.socketPath)
	if err != nil {
		return "", fmt.Errorf("bridge.Ping: %w", err)
	}
	defer conn.Close()

	req := map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "ping",
	}

	if err := json.NewEncoder(conn).Encode(req); err != nil {
		return "", fmt.Errorf("bridge.Ping: %w", err)
	}

	var resp map[string]any
	if err := json.NewDecoder(conn).Decode(&resp); err != nil {
		return "", fmt.Errorf("bridge.Ping: %w", err)
	}

	result, ok := resp["result"].(string)
	if !ok {
		return "", fmt.Errorf("bridge.Ping: unexpected result type")
	}

	return result, nil
}
