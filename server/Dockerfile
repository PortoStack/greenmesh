# ==========================================
# Stage 1: Build stage
# ==========================================
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git ca-certificates

# Copy dependency manifests first for Docker layer caching
COPY go.mod go.sum ./
RUN go mod download

# Copy application source code
COPY . .

# Compile static binary with optimizations (-w -s strips debug information)
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-w -s" \
    -o /app/server ./cmd/api/main.go

# ==========================================
# Stage 2: Minimal & Secure Runtime Stage
# ==========================================
FROM alpine:3.20 AS runner

WORKDIR /app

# Install CA certificates, timezone data, and curl/wget for healthchecks
RUN apk add --no-cache ca-certificates tzdata curl \
    && adduser -D -u 1001 -g appuser appuser

USER appuser

# Copy static binary from builder
COPY --from=builder --chown=appuser:appuser /app/server /app/server

# Expose API port
EXPOSE 8080

# Default environment variables
ENV PORT=8080 \
    MQTT_BROKER_HOST=mqtt-broker \
    MQTT_BROKER_PORT=1883 \
    MQTT_CLIENT_ID=greenmesh-server \
    CORS_ORIGINS=* \
    NODE_TIMEOUT_SEC=15 \
    TZ=Asia/Bangkok

# Run the compiled Go Fiber application
ENTRYPOINT ["/app/server"]
