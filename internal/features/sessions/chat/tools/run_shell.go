package tools

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os/exec"
	"time"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
)

type RunShellParams struct {
	Command        string `json:"command"                   description:"The shell command to execute"`
	TimeoutSeconds int    `json:"timeout_seconds,omitempty" description:"Timeout in seconds (default 30)"`
}

type RunShellTool struct{}

func NewRunShell() *RunShellTool {
	return &RunShellTool{}
}

func (t *RunShellTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"run_shell",
		"Execute an arbitrary shell command on the host machine and return stdout, stderr, and exit code. Use for adb commands, curl through the proxy, decompilation tools (jadx, apktool), openssl, or any host CLI tool.",
		RunShellParams{},
	)
}

func (t *RunShellTool) Run(
	ctx context.Context,
	params tool.ToolCall,
) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[RunShellParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("invalid input: %v", err),
		), nil
	}

	if input.Command == "" {
		return tool.NewTextErrorResponse("command is required"), nil
	}

	timeout := 30
	if input.TimeoutSeconds > 0 {
		timeout = input.TimeoutSeconds
	}

	ctx, cancel := context.WithTimeout(ctx, time.Duration(timeout)*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "sh", "-c", input.Command)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	runErr := cmd.Run()

	exitCode := 0
	if runErr != nil {
		var exitErr *exec.ExitError
		if errors.As(runErr, &exitErr) {
			exitCode = exitErr.ExitCode()
		} else {
			return tool.NewTextErrorResponse(fmt.Sprintf("exec failed: %v", runErr)), nil
		}
	}

	type result struct {
		Stdout   string `json:"stdout"`
		Stderr   string `json:"stderr"`
		ExitCode int    `json:"exit_code"`
	}

	return tool.NewJSONResponse(result{
		Stdout:   stdout.String(),
		Stderr:   stderr.String(),
		ExitCode: exitCode,
	}), nil
}
