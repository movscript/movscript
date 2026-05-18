GOCACHE ?= /private/tmp/movscript-go-cache

.PHONY: dev migrate-up migrate-status tidy test test-unit test-architecture test-model-capability-contract

dev:
	go run ./cmd/server

migrate-up:
	go run ./cmd/migrate up

migrate-status:
	go run ./cmd/migrate status

tidy:
	go mod tidy

test: test-unit test-architecture

test-unit:
	GOCACHE=$(GOCACHE) go test ./...

test-architecture:
	GOCACHE=$(GOCACHE) go test -tags architecture ./internal/app ./internal/domain ./internal/interfaces/http ./internal/infra/persistence/model

test-model-capability-contract:
	GOCACHE=$(GOCACHE) go test ./internal/infra/ai ./internal/app/admin/ai ./internal/app/job ./internal/interfaces/http/handler
