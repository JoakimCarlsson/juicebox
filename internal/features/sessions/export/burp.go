package export

import (
	"encoding/base64"
	"encoding/xml"
	"fmt"
	"net/url"
	"path"
	"sort"
	"strings"
	"time"

	"github.com/joakimcarlsson/juicebox/internal/db"
)

type burpItems struct {
	XMLName     xml.Name   `xml:"items"`
	BurpVersion string     `xml:"burpVersion,attr"`
	ExportTime  string     `xml:"exportTime,attr"`
	Items       []burpItem `xml:"item"`
}

type burpItem struct {
	Time           string       `xml:"time"`
	URL            string       `xml:"url"`
	Host           burpHost     `xml:"host"`
	Port           string       `xml:"port"`
	Protocol       string       `xml:"protocol"`
	Method         string       `xml:"method"`
	Path           string       `xml:"path"`
	Extension      string       `xml:"extension"`
	Request        burpBase64   `xml:"request"`
	Status         int          `xml:"status"`
	ResponseLength int          `xml:"responselength"`
	MimeType       string       `xml:"mimetype"`
	Response       burpBase64   `xml:"response"`
	Comment        string       `xml:"comment"`
}

type burpHost struct {
	IP   string `xml:"ip,attr"`
	Host string `xml:",chardata"`
}

type burpBase64 struct {
	Base64 string `xml:"base64,attr"`
	Data   string `xml:",chardata"`
}

func buildBurpXML(rows []db.HttpMessageRow) ([]byte, error) {
	items := make([]burpItem, 0, len(rows))

	for _, r := range rows {
		u, err := url.Parse(r.URL)
		if err != nil {
			u = &url.URL{Host: "unknown", Path: "/", Scheme: "https"}
		}

		host := u.Hostname()
		port := u.Port()
		protocol := u.Scheme
		if port == "" {
			if protocol == "https" {
				port = "443"
			} else {
				port = "80"
			}
		}

		reqHeaders := parseHeaders(r.RequestHeaders)
		respHeaders := parseHeaders(r.ResponseHeaders)

		rawReq := buildRawRequest(r.Method, u, reqHeaders, r.RequestBody, r.RequestBodyEncoding)
		rawResp := buildRawResponse(r.StatusCode, respHeaders, r.ResponseBody, r.ResponseBodyEncoding)

		ext := ""
		if p := u.Path; p != "" {
			ext = strings.TrimPrefix(path.Ext(p), ".")
		}

		ct := respHeaders["content-type"]
		if ct == "" {
			ct = respHeaders["Content-Type"]
		}
		mimeType := ct
		if idx := strings.Index(mimeType, ";"); idx != -1 {
			mimeType = mimeType[:idx]
		}

		items = append(items, burpItem{
			Time:           time.UnixMilli(r.Timestamp).UTC().Format("Mon Jan 02 15:04:05 MST 2006"),
			URL:            r.URL,
			Host:           burpHost{IP: "", Host: host},
			Port:           port,
			Protocol:       protocol,
			Method:         r.Method,
			Path:           u.RequestURI(),
			Extension:      ext,
			Request:        burpBase64{Base64: "true", Data: base64.StdEncoding.EncodeToString(rawReq)},
			Status:         r.StatusCode,
			ResponseLength: len(rawResp),
			MimeType:       mimeType,
			Response:       burpBase64{Base64: "true", Data: base64.StdEncoding.EncodeToString(rawResp)},
		})
	}

	root := burpItems{
		BurpVersion: "2024.0",
		ExportTime:  time.Now().UTC().Format("Mon Jan 02 15:04:05 MST 2006"),
		Items:       items,
	}

	out, err := xml.MarshalIndent(root, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("marshal burp xml: %w", err)
	}

	return append([]byte(xml.Header), out...), nil
}

func buildRawRequest(method string, u *url.URL, headers map[string]string, body *string, bodyEncoding string) []byte {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("%s %s HTTP/1.1\r\n", method, u.RequestURI()))
	b.WriteString(fmt.Sprintf("Host: %s\r\n", u.Host))

	keys := sortedKeys(headers)
	for _, k := range keys {
		if strings.EqualFold(k, "host") {
			continue
		}
		b.WriteString(fmt.Sprintf("%s: %s\r\n", k, headers[k]))
	}
	b.WriteString("\r\n")

	if body != nil && *body != "" {
		if bodyEncoding == "base64" {
			if decoded, err := base64.StdEncoding.DecodeString(*body); err == nil {
				b.Write(decoded)
			}
		} else {
			b.WriteString(*body)
		}
	}

	return []byte(b.String())
}

func buildRawResponse(statusCode int, headers map[string]string, body *string, bodyEncoding string) []byte {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("HTTP/1.1 %d %s\r\n", statusCode, statusText(statusCode)))

	keys := sortedKeys(headers)
	for _, k := range keys {
		b.WriteString(fmt.Sprintf("%s: %s\r\n", k, headers[k]))
	}
	b.WriteString("\r\n")

	if body != nil && *body != "" {
		if bodyEncoding == "base64" {
			if decoded, err := base64.StdEncoding.DecodeString(*body); err == nil {
				b.Write(decoded)
			}
		} else {
			b.WriteString(*body)
		}
	}

	return []byte(b.String())
}

func sortedKeys(m map[string]string) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}
