.PHONY: install dev build build-agent sidecar clean kill-ports

PORTS := 8080 5173

kill-ports:
	@for port in $(PORTS); do \
		pid=$$(lsof -ti tcp:$$port 2>/dev/null); \
		if [ -n "$$pid" ]; then \
			echo "Killing process(es) on port $$port (PID: $$pid)"; \
			kill -9 $$pid 2>/dev/null || true; \
		fi; \
	done

install:
	cd web && bun install
	cd agent && deno install --allow-scripts=npm:frida
	go mod tidy

dev: kill-ports build-agent
	@echo "Starting Air, Vite dev server, and Frida sidecar..."
	@(cd web && bun run dev) & $(shell go env GOPATH)/bin/air & (cd sidecar && deno task dev) & wait

build: build-web
	go build -o juicebox ./cmd/juicebox/

build-web:
	cd web && bun run build

build-agent:
	cd agent && deno task build

sidecar:
	cd sidecar && deno task dev

clean:
	rm -f juicebox
	rm -rf web/dist
	rm -rf agent/dist
