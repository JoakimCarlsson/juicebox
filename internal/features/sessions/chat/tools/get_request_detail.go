package tools

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/joakimcarlsson/ai/agent"
	"github.com/joakimcarlsson/ai/tool"
	"github.com/joakimcarlsson/juicebox/internal/db"
)

type GetRequestDetailParams struct {
	MessageID string `json:"message_id" description:"The ID of the HTTP message to retrieve"`
}

type GetRequestDetailTool struct {
	db *db.DB
}

func NewGetRequestDetail(database *db.DB) *GetRequestDetailTool {
	return &GetRequestDetailTool{db: database}
}

func (t *GetRequestDetailTool) Info() tool.ToolInfo {
	return tool.NewToolInfo(
		"get_request_detail",
		"Retrieve the full details of a specific HTTP request/response by its message ID. Returns method, URL, headers, request body, response status, response headers, and response body.",
		GetRequestDetailParams{},
	)
}

func (t *GetRequestDetailTool) Run(
	ctx context.Context,
	params tool.ToolCall,
) (tool.ToolResponse, error) {
	input, err := agent.ParseToolInput[GetRequestDetailParams](params.Input)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("invalid input: %v", err),
		), nil
	}

	row, err := t.db.GetHttpMessage(input.MessageID)
	if err != nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("lookup failed: %v", err),
		), nil
	}
	if row == nil {
		return tool.NewTextErrorResponse(
			fmt.Sprintf("no message found with ID: %s", input.MessageID),
		), nil
	}

	var reqHeaders map[string]string
	json.Unmarshal([]byte(row.RequestHeaders), &reqHeaders)

	var respHeaders map[string]string
	json.Unmarshal([]byte(row.ResponseHeaders), &respHeaders)

	detail := map[string]any{
		"id":              row.ID,
		"method":          row.Method,
		"url":             row.URL,
		"status_code":     row.StatusCode,
		"duration_ms":     row.Duration,
		"request_headers": reqHeaders,
		"request_body": truncateBody(
			row.RequestBody,
			row.RequestBodyEncoding,
		),
		"response_headers": respHeaders,
		"response_body": truncateBody(
			row.ResponseBody,
			row.ResponseBodyEncoding,
		),
	}

	return tool.NewJSONResponse(detail), nil
}

const maxBodySize = 4096

func truncateBody(body *string, encoding string) string {
	if body == nil {
		return ""
	}
	if encoding == "base64" {
		return "[binary data, base64 encoded, " + fmt.Sprintf(
			"%d bytes",
			len(*body),
		) + "]"
	}
	if len(*body) > maxBodySize {
		return (*body)[:maxBodySize] + "\n... [truncated]"
	}
	return *body
}
