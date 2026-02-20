.PHONY: install dev build build-agent sidecar clean

install:
	cd web && bun install
	cd agent && npm install
	go mod tidy

dev:
	@echo "Starting Air (Go hot reload) and Vite dev server..."
	@(cd web && bun run dev) & air & wait

build: build-web
	go build -o juicebox ./cmd/juicebox/

build-web:
	cd web && bun run build

build-agent:
	cd agent && npm run build

sidecar:
	cd sidecar && deno task dev

clean:
	rm -f juicebox
	rm -rf web/dist
	rm -rf agent/dist
