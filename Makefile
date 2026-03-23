.PHONY: install dev build build-agent sidecar clean kill-ports lint fmt check

PORTS := 8080 5173
DENO := $(HOME)/.deno/bin/deno

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
	cd agent && $(DENO) install --allow-scripts=npm:frida
	go mod tidy

dev: kill-ports build-agent
	@mkdir -p web/dist
	@echo "Starting Air, Vite dev server, and Frida sidecar..."
	@(cd web && bun run dev) & $(shell go env GOPATH)/bin/air & (cd sidecar && $(DENO) task dev) & wait

build: build-web
	go build -o juicebox ./cmd/juicebox/

build-web:
	cd web && bun run build

build-agent:
	@mkdir -p agent/dist
	cd agent && $(DENO) task build

sidecar:
	cd sidecar && $(DENO) task dev

lint:
	go vet ./...
	$(shell go env GOPATH)/bin/golangci-lint run ./...
	cd web && bun eslint src
	cd agent && $(DENO) lint
	cd sidecar && $(DENO) lint

fmt:
	$(shell go env GOPATH)/bin/goimports -w .
	$(shell go env GOPATH)/bin/golines -m 80 --ignored-dirs=deps -w .
	cd web && bun prettier --write "src/**/*.{ts,tsx}"
	cd agent && $(DENO) fmt
	cd sidecar && $(DENO) fmt

check: lint

clean:
	rm -f juicebox
	rm -rf web/dist
	rm -rf agent/dist
