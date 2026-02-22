.PHONY: install dev build build-agent sidecar clean

install:
	cd web && bun install
	cd agent && deno install --allow-scripts=npm:frida
	go mod tidy

dev: build-agent
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
