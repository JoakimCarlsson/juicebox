package proxy

import (
	"encoding/base64"
	"fmt"
	"sync/atomic"
	"time"
	"unicode/utf8"
)

var messageCounter atomic.Int64

func generateID() string {
	return fmt.Sprintf("p-%d-%d", time.Now().UnixMilli(), messageCounter.Add(1))
}

const maxBodyBytes = 65536

type HttpMessage struct {
	ID                   string            `json:"id"`
	Method               string            `json:"method"`
	URL                  string            `json:"url"`
	RequestHeaders       map[string]string `json:"requestHeaders"`
	RequestBody          *string           `json:"requestBody,omitempty"`
	RequestBodyEncoding  string            `json:"requestBodyEncoding,omitempty"`
	RequestBodySize      int               `json:"requestBodySize"`
	StatusCode           int               `json:"statusCode"`
	ResponseHeaders      map[string]string `json:"responseHeaders"`
	ResponseBody         *string           `json:"responseBody,omitempty"`
	ResponseBodyEncoding string            `json:"responseBodyEncoding,omitempty"`
	ResponseBodySize     int               `json:"responseBodySize"`
	Duration             int64             `json:"duration"`
	Timestamp            int64             `json:"timestamp"`
}

type AgentMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload,omitempty"`
}

func EncodeBody(data []byte) (body *string, encoding string) {
	if len(data) == 0 {
		return nil, ""
	}

	if utf8.Valid(data) {
		s := string(data)
		return &s, "utf8"
	}

	s := base64.StdEncoding.EncodeToString(data)
	return &s, "base64"
}
