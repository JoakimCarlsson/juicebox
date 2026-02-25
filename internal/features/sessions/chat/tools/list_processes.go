package tools

import (
	"context"
	"fmt"

	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/session"
)

type ListProcessesParams struct{}

type ListProcessesTool struct {
	setup    session.DeviceSetup
	deviceID string
}

func NewListProcesses(
	setup session.DeviceSetup,
	deviceID string,
) *ListProcessesTool {
	return &ListProcessesTool{setup: setup, deviceID: deviceID}
}

func (t *ListProcessesTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"list_processes",
		"List all running processes on the connected device. Returns process ID and name for each process.",
		ListProcessesParams{},
	)
}

func (t *ListProcessesTool) Run(
	ctx context.Context,
	params tool.ToolCall,
) (tool.ToolResponse, error) {
	processes, err := t.setup.ListProcesses(t.deviceID)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("failed to list processes: %v", err),
		), nil
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
