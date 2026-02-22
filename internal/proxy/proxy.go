package proxy

import (
	"bufio"
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

const maxTotalBodyRead = 10 * 1024 * 1024 // 10MB

type MessageSink func(AgentMessage)

type Proxy struct {
	certManager *CertManager
	sink        MessageSink
	listener    net.Listener
	transport   *http.Transport
	done        chan struct{}
	wg          sync.WaitGroup
}

func NewProxy(cm *CertManager, sink MessageSink) *Proxy {
	return &Proxy{
		certManager: cm,
		sink:        sink,
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

func (p *Proxy) Stop() {
	close(p.done)
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
				log.Printf("[proxy] accept error: %v", err)
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
	req, err := http.ReadRequest(br)
	if err != nil {
		log.Printf("[proxy] read request error: %v", err)
		return
	}

	log.Printf("[proxy] %s %s", req.Method, req.Host)

	if req.Method == http.MethodConnect {
		p.handleConnect(conn, req)
	} else {
		p.handlePlainHTTP(conn, req)
	}
}

func (p *Proxy) handleConnect(clientConn net.Conn, connectReq *http.Request) {
	host := connectReq.Host
	if !strings.Contains(host, ":") {
		host += ":443"
	}
	hostname, _, _ := net.SplitHostPort(host)

	clientConn.Write([]byte("HTTP/1.1 200 Connection Established\r\n\r\n"))

	cert, err := p.certManager.GetCert(hostname)
	if err != nil {
		log.Printf("[proxy] cert error for %s: %v", hostname, err)
		return
	}

	tlsConn := tls.Server(clientConn, &tls.Config{
		Certificates: []tls.Certificate{*cert},
	})
	defer tlsConn.Close()

	if err := tlsConn.Handshake(); err != nil {
		log.Printf("[proxy] TLS handshake FAILED for %s: %v", hostname, err)
		return
	}

	log.Printf("[proxy] TLS handshake OK for %s", hostname)

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

	resp, err := p.transport.RoundTrip(req)
	if err != nil {
		log.Printf("[proxy] roundtrip error %s %s: %v", req.Method, req.URL, err)
		clientConn.Write([]byte("HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n"))
		return
	}
	defer resp.Body.Close()

	respFullBody, _ := io.ReadAll(io.LimitReader(resp.Body, maxTotalBodyRead))

	duration := time.Since(start).Milliseconds()

	p.emitMessage(req, reqFullBody, resp, respFullBody, duration)

	resp.Body = io.NopCloser(bytes.NewReader(respFullBody))
	resp.ContentLength = int64(len(respFullBody))
	resp.Header.Del("Transfer-Encoding")
	resp.Write(clientConn)
}

func (p *Proxy) emitMessage(req *http.Request, reqBody []byte, resp *http.Response, respBody []byte, duration int64) {
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
	if len(reqCapture) > maxBodyBytes {
		reqCapture = reqCapture[:maxBodyBytes]
	}
	respCapture := respBody
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

func MarshalMessage(msg AgentMessage) ([]byte, error) {
	data, err := json.Marshal(msg)
	if err != nil {
		return nil, err
	}
	return append(data, '\n'), nil
}
