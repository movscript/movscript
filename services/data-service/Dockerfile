# syntax=docker/dockerfile:1.7

FROM golang:1.25-alpine AS builder
WORKDIR /src/services/data-service
COPY services/data-service/go.mod services/data-service/go.sum ./
COPY services/data-service/vendor ./vendor
COPY services/data-service ./
RUN --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -mod=vendor -o server ./cmd/server
RUN --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -mod=vendor -o migrate ./cmd/migrate

FROM alpine:3.20
WORKDIR /app
COPY --from=builder /src/services/data-service/server .
COPY --from=builder /src/services/data-service/migrate .
EXPOSE 8765
CMD ["./server"]
