package export

import (
	"encoding/json"
	"fmt"
	"net/url"
	"time"

	"github.com/joakimcarlsson/juicebox/internal/db"
)

type harRoot struct {
	Log harLog `json:"log"`
}

type harLog struct {
	Version string     `json:"version"`
	Creator harCreator `json:"creator"`
	Entries []harEntry `json:"entries"`
}

type harCreator struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

type harEntry struct {
	StartedDateTime string      `json:"startedDateTime"`
	Time            float64     `json:"time"`
	Request         harRequest  `json:"request"`
	Response        harResponse `json:"response"`
	Timings         harTimings  `json:"timings"`
}

type harRequest struct {
	Method      string      `json:"method"`
	URL         string      `json:"url"`
	HTTPVersion string      `json:"httpVersion"`
	Headers     []harNV     `json:"headers"`
	QueryString []harNV     `json:"queryString"`
	PostData    *harContent `json:"postData,omitempty"`
	HeadersSize int         `json:"headersSize"`
	BodySize    int         `json:"bodySize"`
}

type harResponse struct {
	Status      int            `json:"status"`
	StatusText  string         `json:"statusText"`
	HTTPVersion string         `json:"httpVersion"`
	Headers     []harNV        `json:"headers"`
	Content     harRespContent `json:"content"`
	HeadersSize int            `json:"headersSize"`
	BodySize    int            `json:"bodySize"`
}

type harNV struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type harContent struct {
	MimeType string `json:"mimeType"`
	Text     string `json:"text"`
}

type harRespContent struct {
	Size     int    `json:"size"`
	MimeType string `json:"mimeType"`
	Text     string `json:"text,omitempty"`
	Encoding string `json:"encoding,omitempty"`
}

type harTimings struct {
	Send    float64 `json:"send"`
	Wait    float64 `json:"wait"`
	Receive float64 `json:"receive"`
}

func buildHAR(rows []db.HttpMessageRow) ([]byte, error) {
	entries := make([]harEntry, 0, len(rows))

	for _, r := range rows {
		reqHeaders := parseHeaders(r.RequestHeaders)
		respHeaders := parseHeaders(r.ResponseHeaders)

		var qs []harNV
		if u, err := url.Parse(r.URL); err == nil {
			for k, vals := range u.Query() {
				for _, v := range vals {
					qs = append(qs, harNV{Name: k, Value: v})
				}
			}
		}

		entry := harEntry{
			StartedDateTime: time.UnixMilli(r.Timestamp).
				UTC().
				Format(time.RFC3339Nano),
			Time: float64(r.Duration),
			Request: harRequest{
				Method:      r.Method,
				URL:         r.URL,
				HTTPVersion: "HTTP/1.1",
				Headers:     mapToNV(reqHeaders),
				QueryString: qs,
				HeadersSize: -1,
				BodySize:    r.RequestBodySize,
			},
			Response: harResponse{
				Status:      r.StatusCode,
				StatusText:  statusText(r.StatusCode),
				HTTPVersion: "HTTP/1.1",
				Headers:     mapToNV(respHeaders),
				Content: buildRespContent(
					r.ResponseBody,
					r.ResponseBodyEncoding,
					r.ResponseBodySize,
					respHeaders,
				),
				HeadersSize: -1,
				BodySize:    r.ResponseBodySize,
			},
			Timings: harTimings{
				Send:    0,
				Wait:    float64(r.Duration),
				Receive: 0,
			},
		}

		if r.RequestBody != nil && *r.RequestBody != "" {
			mimeType := reqHeaders["content-type"]
			if mimeType == "" {
				mimeType = reqHeaders["Content-Type"]
			}
			entry.Request.PostData = &harContent{
				MimeType: mimeType,
				Text:     *r.RequestBody,
			}
		}

		entries = append(entries, entry)
	}

	root := harRoot{
		Log: harLog{
			Version: "1.2",
			Creator: harCreator{Name: "Juicebox", Version: "1.0"},
			Entries: entries,
		},
	}

	return json.MarshalIndent(root, "", "  ")
}

func buildRespContent(
	body *string,
	encoding string,
	size int,
	headers map[string]string,
) harRespContent {
	ct := headers["content-type"]
	if ct == "" {
		ct = headers["Content-Type"]
	}

	rc := harRespContent{
		Size:     size,
		MimeType: ct,
	}

	if body != nil && *body != "" {
		rc.Text = *body
		if encoding == "base64" {
			rc.Encoding = "base64"
		}
	}

	return rc
}

func parseHeaders(raw string) map[string]string {
	var m map[string]string
	if err := json.Unmarshal([]byte(raw), &m); err != nil || m == nil {
		return map[string]string{}
	}
	return m
}

func mapToNV(m map[string]string) []harNV {
	nv := make([]harNV, 0, len(m))
	for k, v := range m {
		nv = append(nv, harNV{Name: k, Value: v})
	}
	return nv
}

func statusText(code int) string {
	text := fmt.Sprintf("%d", code)
	if t := statusTextMap[code]; t != "" {
		return t
	}
	return text
}

var statusTextMap = map[int]string{
	200: "OK",
	201: "Created",
	204: "No Content",
	301: "Moved Permanently",
	302: "Found",
	304: "Not Modified",
	400: "Bad Request",
	401: "Unauthorized",
	403: "Forbidden",
	404: "Not Found",
	405: "Method Not Allowed",
	500: "Internal Server Error",
	502: "Bad Gateway",
	503: "Service Unavailable",
}
