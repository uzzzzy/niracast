# syntax=docker/dockerfile:1
FROM golang:1.27-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/tv-stream ./cmd/server

FROM alpine:3.21
RUN apk add --no-cache ffmpeg ca-certificates tzdata \
    && addgroup -S app && adduser -S -G app app \
    && mkdir -p /app /data /data/idle /transcode /media \
    && chown -R app:app /app /data /transcode /media
WORKDIR /app
COPY --from=builder --chown=app:app /app/tv-stream /app/tv-stream
COPY --chown=app:app web/static /app/web/static
# Idle stream filler assets: the JPEG is encoded into idle.mp4 at startup.
COPY --chown=app:app assets/filler /app/assets/filler
USER app
VOLUME ["/data", "/transcode", "/media"]
ENTRYPOINT ["/app/tv-stream"]

