FROM oven/bun:1 AS frontend
WORKDIR /app/web
COPY web/package.json web/bun.lock* ./
RUN bun install --frozen-lockfile
COPY web/ .
RUN bun run build

FROM node:22-slim AS agent
WORKDIR /app/agent
COPY agent/package.json agent/package-lock.json* ./
RUN npm ci
COPY agent/ .

FROM golang:1.26 AS backend
WORKDIR /app
COPY go.mod go.sum ./
COPY deps/ deps/
RUN go mod download
COPY --from=frontend /app/web/dist web/dist
COPY . .
RUN CGO_ENABLED=0 go build -o juicebox ./cmd/juicebox/

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl unzip && \
    curl -fsSL https://deno.land/install.sh | sh && \
    apt-get clean && rm -rf /var/lib/apt/lists/*
ENV DENO_INSTALL="/root/.deno"
ENV PATH="${DENO_INSTALL}/bin:${PATH}"

WORKDIR /app
COPY --from=backend /app/juicebox .
COPY --from=agent /app/agent/node_modules agent/node_modules
COPY agent/src agent/src
COPY agent/package.json agent/
COPY agent/tsconfig.json agent/
COPY sidecar/ sidecar/

EXPOSE 8080
CMD ["./juicebox"]
