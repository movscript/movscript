FROM golang:1.25-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
COPY vendor ./vendor
COPY . .
RUN CGO_ENABLED=0 go build -mod=vendor -o server ./cmd/server
RUN CGO_ENABLED=0 go build -mod=vendor -o migrate ./cmd/migrate

FROM alpine:3.20
WORKDIR /app
RUN apk add --no-cache ffmpeg
COPY --from=builder /app/server .
COPY --from=builder /app/migrate .
EXPOSE 8765
CMD ["./server"]
