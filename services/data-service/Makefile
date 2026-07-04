GOCACHE ?= $(shell node -e "process.stdout.write(require('node:path').join(require('node:os').tmpdir(), 'movscript-go-cache'))")

.PHONY: dev migrate-up migrate-status tidy test test-unit test-architecture test-model-capability-contract test-newapi-smoke test-newapi-real-smoke test-newapi-real-smoke-secure

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

test-newapi-smoke:
	GOCACHE=$(GOCACHE) go test ./internal/infra/ai -run 'TestNewAPIFakeServerSmokeCoversRuntimeEndpoints|TestNewAPIRealSmokeFromEnvironment' -count=1

test-newapi-real-smoke:
	MOVSCRIPT_NEW_API_REAL_SMOKE=1 GOCACHE=$(GOCACHE) go test ./internal/infra/ai -run TestNewAPIRealSmokeFromEnvironment -count=1 -v

test-newapi-real-smoke-secure:
	bash ../../scripts/run-newapi-real-smoke.sh
