package proxy

import (
	"bufio"
	"bytes"
	"compress/flate"
	"compress/gzip"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/andybalholm/brotli"
)

const maxTotalBodyRead = 10 * 1024 * 1024

type MessageSink func(AgentMessage)

type Proxy struct {
	certManager *CertManager
	sink        MessageSink
	intercept   *InterceptEngine
	logger      *slog.Logger
	listener    net.Listener
	transport   *http.Transport
	done        chan struct{}
	wg          sync.WaitGroup
}

func NewProxy(cm *CertManager, sink MessageSink, logger *slog.Logger) *Proxy {
	return &Proxy{
		certManager: cm,
		sink:        sink,
		logger:      logger,
		transport: &http.Transport{
			TLSClientConfig: &tls.Config{},
			MaxIdleConns:    100,
			IdleConnTimeout: 90 * time.Second,
		},
		done: make(chan struct{}),
	}
}

func (p *Proxy) Start() (int, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, fmt.Errorf("proxy: listen: %w", err)
	}
	p.listener = ln

	port := ln.Addr().(*net.TCPAddr).Port

	p.wg.Add(1)
	go func() {
		defer p.wg.Done()
		p.serve()
	}()

	return port, nil
}

func (p *Proxy) Port() int {
	if p.listener == nil {
		return 0
	}
	return p.listener.Addr().(*net.TCPAddr).Port
}

func (p *Proxy) SetInterceptEngine(ie *InterceptEngine) {
	p.intercept = ie
}

func (p *Proxy) InterceptEngine() *InterceptEngine {
	return p.intercept
}

func (p *Proxy) Stop() {
	close(p.done)
	if p.intercept != nil {
		p.intercept.ResolveAll(ActionForward)
	}
	if p.listener != nil {
		p.listener.Close()
	}
	p.transport.CloseIdleConnections()
	p.wg.Wait()
}

func (p *Proxy) serve() {
	for {
		conn, err := p.listener.Accept()
		if err != nil {
			select {
			case <-p.done:
				return
			default:
				continue
			}
		}

		p.wg.Add(1)
		go func() {
			defer p.wg.Done()
			p.handleConn(conn)
		}()
	}
}

func (p *Proxy) handleConn(conn net.Conn) {
	defer conn.Close()

	br := bufio.NewReader(conn)

	first, err := br.Peek(1)
	if err != nil {
		return
	}

	if first[0] == 0x16 {
		p.handleTransparentTLS(conn, br)
		return
	}

	req, err := http.ReadRequest(br)
	if err != nil {
		return
	}

	if req.Method == http.MethodConnect {
		p.handleConnect(conn, req)
	} else {
		p.handlePlainHTTP(conn, req)
	}
}

func extractSNI(data []byte) string {
	if len(data) < 5 || data[0] != 0x16 {
		return ""
	}
	recordLen := int(data[3])<<8 | int(data[4])
	if len(data) < 5+recordLen {
		return ""
	}
	msg := data[5 : 5+recordLen]
	if len(msg) < 38 {
		return ""
	}
	pos := 1 + 3 + 2 + 32 // type + length + version + random
	if pos >= len(msg) {
		return ""
	}
	sessionIDLen := int(msg[pos])
	pos += 1 + sessionIDLen
	if pos+2 > len(msg) {
		return ""
	}
	cipherSuitesLen := int(msg[pos])<<8 | int(msg[pos+1])
	pos += 2 + cipherSuitesLen
	if pos >= len(msg) {
		return ""
	}
	compMethodsLen := int(msg[pos])
	pos += 1 + compMethodsLen
	if pos+2 > len(msg) {
		return ""
	}
	extensionsLen := int(msg[pos])<<8 | int(msg[pos+1])
	pos += 2
	end := pos + extensionsLen
	if end > len(msg) {
		end = len(msg)
	}
	for pos+4 <= end {
		extType := int(msg[pos])<<8 | int(msg[pos+1])
		extLen := int(msg[pos+2])<<8 | int(msg[pos+3])
		pos += 4
		if extType == 0 && pos+extLen <= end { // SNI extension
			d := msg[pos : pos+extLen]
			if len(d) >= 5 {
				nameLen := int(d[3])<<8 | int(d[4])
				if 5+nameLen <= len(d) {
					return string(d[5 : 5+nameLen])
				}
			}
		}
		pos += extLen
	}
	return ""
}

func (p *Proxy) handleTransparentTLS(clientConn net.Conn, br *bufio.Reader) {
	// Peek enough to read TLS record header (5 bytes) then the full record.
	recHeader, err := br.Peek(5)
	if err != nil || len(recHeader) < 5 {
		return
	}
	recordLen := int(recHeader[3])<<8 | int(recHeader[4])
	fullLen := 5 + recordLen
	if fullLen > 16384 {
		fullLen = 16384
	}
	header, err := br.Peek(fullLen)
	if err != nil && len(header) < 43 {
		return
	}

	hostname := extractSNI(header)
	if hostname == "" {
		return
	}

	cert, err := p.certManager.GetCert(hostname)
	if err != nil {
		return
	}

	tlsConn := tls.Server(readPrefixConn{br: br, Conn: clientConn}, &tls.Config{
		Certificates: []tls.Certificate{*cert},
	})
	defer tlsConn.Close()

	if err := tlsConn.Handshake(); err != nil {
		return
	}

	host := hostname + ":443"
	tlsBr := bufio.NewReader(tlsConn)
	for {
		select {
		case <-p.done:
			return
		default:
		}

		req, err := http.ReadRequest(tlsBr)
		if err != nil {
			return
		}

		req.URL.Scheme = "https"
		req.URL.Host = host
		req.RequestURI = ""

		p.roundTripAndEmit(tlsConn, req)
	}
}

type readPrefixConn struct {
	br *bufio.Reader
	net.Conn
}

func (c readPrefixConn) Read(b []byte) (int, error) {
	return c.br.Read(b)
}

func (p *Proxy) handleConnect(clientConn net.Conn, connectReq *http.Request) {
	host := connectReq.Host
	if !strings.Contains(host, ":") {
		host += ":443"
	}
	hostname, _, _ := net.SplitHostPort(host)

	_, _ = clientConn.Write(
		[]byte("HTTP/1.1 200 Connection Established\r\n\r\n"),
	)

	cert, err := p.certManager.GetCert(hostname)
	if err != nil {
		return
	}

	tlsConn := tls.Server(clientConn, &tls.Config{
		Certificates: []tls.Certificate{*cert},
	})
	defer tlsConn.Close()

	if err := tlsConn.Handshake(); err != nil {
		return
	}

	br := bufio.NewReader(tlsConn)
	for {
		select {
		case <-p.done:
			return
		default:
		}

		req, err := http.ReadRequest(br)
		if err != nil {
			return
		}

		req.URL.Scheme = "https"
		req.URL.Host = host
		req.RequestURI = ""

		p.roundTripAndEmit(tlsConn, req)
	}
}

func (p *Proxy) handlePlainHTTP(clientConn net.Conn, req *http.Request) {
	if req.URL.Host == "" {
		req.URL.Host = req.Host
	}
	if req.URL.Scheme == "" {
		req.URL.Scheme = "http"
	}
	req.RequestURI = ""

	p.roundTripAndEmit(clientConn, req)
}

func (p *Proxy) roundTripAndEmit(clientConn net.Conn, req *http.Request) {
	start := time.Now()

	var reqFullBody []byte
	if req.Body != nil {
		reqFullBody, _ = io.ReadAll(io.LimitReader(req.Body, maxTotalBodyRead))
		req.Body.Close()
		req.Body = io.NopCloser(bytes.NewReader(reqFullBody))
		req.ContentLength = int64(len(reqFullBody))
	}

	if p.intercept != nil && p.intercept.IsEnabled() {
		var drop bool
		req, reqFullBody, drop = p.intercept.MaybeIntercept(req, reqFullBody)
		if drop {
			_, _ = clientConn.Write(
				[]byte("HTTP/1.1 502 Blocked\r\nContent-Length: 0\r\n\r\n"),
			)
			return
		}
		req.Body = io.NopCloser(bytes.NewReader(reqFullBody))
		req.ContentLength = int64(len(reqFullBody))
	}

	resp, err := p.transport.RoundTrip(req)
	if err != nil {
		_, _ = clientConn.Write(
			[]byte("HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n"),
		)
		return
	}
	defer resp.Body.Close()

	respFullBody, _ := io.ReadAll(io.LimitReader(resp.Body, maxTotalBodyRead))

	if p.intercept != nil && p.intercept.IsEnabled() {
		var drop bool
		respFullBody, resp.StatusCode, resp.Header, drop = p.intercept.MaybeInterceptResponse(
			req,
			resp,
			respFullBody,
		)
		if drop {
			_, _ = clientConn.Write(
				[]byte("HTTP/1.1 502 Blocked\r\nContent-Length: 0\r\n\r\n"),
			)
			return
		}
	}

	duration := time.Since(start).Milliseconds()

	p.emitMessage(req, reqFullBody, resp, respFullBody, duration)

	resp.Body = io.NopCloser(bytes.NewReader(respFullBody))
	resp.ContentLength = int64(len(respFullBody))
	resp.Header.Del("Transfer-Encoding")
	_ = resp.Write(clientConn)
}

func (p *Proxy) emitMessage(
	req *http.Request,
	reqBody []byte,
	resp *http.Response,
	respBody []byte,
	duration int64,
) {
	reqHeaders := make(map[string]string)
	for k, v := range req.Header {
		reqHeaders[strings.ToLower(k)] = strings.Join(v, ", ")
	}
	if req.Host != "" {
		reqHeaders["host"] = req.Host
	}

	respHeaders := make(map[string]string)
	for k, v := range resp.Header {
		respHeaders[strings.ToLower(k)] = strings.Join(v, ", ")
	}

	reqCapture := reqBody
	respCapture := p.decompressBody(
		respBody,
		resp.Header.Get("Content-Encoding"),
	)

	if len(reqCapture) > maxBodyBytes {
		reqCapture = reqCapture[:maxBodyBytes]
	}
	if len(respCapture) > maxBodyBytes {
		respCapture = respCapture[:maxBodyBytes]
	}

	reqEncBody, reqEncoding := EncodeBody(reqCapture)
	respEncBody, respEncoding := EncodeBody(respCapture)

	msg := AgentMessage{
		Type: "http",
		Payload: HttpMessage{
			ID:                   generateID(),
			Method:               req.Method,
			URL:                  req.URL.String(),
			RequestHeaders:       reqHeaders,
			RequestBody:          reqEncBody,
			RequestBodyEncoding:  reqEncoding,
			RequestBodySize:      len(reqBody),
			StatusCode:           resp.StatusCode,
			ResponseHeaders:      respHeaders,
			ResponseBody:         respEncBody,
			ResponseBodyEncoding: respEncoding,
			ResponseBodySize:     len(respBody),
			Duration:             duration,
			Timestamp:            time.Now().UnixMilli(),
		},
	}

	p.sink(msg)
}

func (p *Proxy) decompressBody(data []byte, encoding string) []byte {
	if len(data) == 0 {
		return data
	}

	enc := strings.ToLower(strings.TrimSpace(encoding))

	switch enc {
	case "gzip":
		r, err := gzip.NewReader(bytes.NewReader(data))
		if err != nil {
			p.logger.Error("gzip reader error", "error", err)
			return data
		}
		defer r.Close()
		out, err := io.ReadAll(io.LimitReader(r, maxTotalBodyRead))
		if err != nil {
			p.logger.Error("gzip read error", "error", err)
			return data
		}
		return out
	case "deflate":
		r := flate.NewReader(bytes.NewReader(data))
		defer r.Close()
		out, err := io.ReadAll(io.LimitReader(r, maxTotalBodyRead))
		if err != nil {
			p.logger.Error("deflate read error", "error", err)
			return data
		}
		return out
	case "br":
		r := brotli.NewReader(bytes.NewReader(data))
		out, err := io.ReadAll(io.LimitReader(r, maxTotalBodyRead))
		if err != nil {
			p.logger.Error("brotli read error", "error", err)
			return data
		}
		return out
	default:
		return data
	}
}

func MarshalMessage(msg AgentMessage) ([]byte, error) {
	data, err := json.Marshal(msg)
	if err != nil {
		return nil, err
	}
	return append(data, '\n'), nil
}
