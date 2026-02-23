package tools

import (
	"context"
	"fmt"

	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/bridge"
)

type ListProcessesParams struct{}

type ListProcessesTool struct {
	bridge   *bridge.Client
	deviceID string
}

func NewListProcesses(bridgeClient *bridge.Client, deviceID string) *ListProcessesTool {
	return &ListProcessesTool{bridge: bridgeClient, deviceID: deviceID}
}

func (t *ListProcessesTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"list_processes",
		"List all running processes on the connected Android device. Returns process ID and name for each process.",
		ListProcessesParams{},
	)
}

func (t *ListProcessesTool) Run(ctx context.Context, params tool.ToolCall) (tool.ToolResponse, error) {
	processes, err := t.bridge.ListProcesses(t.deviceID)
	if err != nil {
		return tool.NewTextErrorResponse(fmt.Sprintf("failed to list processes: %v", err)), nil
	}

	if len(processes) == 0 {
		return tool.NewTextResponse("No running processes found."), nil
	}

	type result struct {
		PID  int    `json:"pid"`
		Name string `json:"name"`
	}

	results := make([]result, len(processes))
	for i, p := range processes {
		results[i] = result{PID: p.PID, Name: p.Name}
	}

	return tool.NewJSONResponse(results), nil
}
