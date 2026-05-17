.PHONY: build build-agent build-apps build-admin build-backend build-backend-with-admin build-frontend build-movcli build-packages build-plugins dev-agent dev-backend dev-frontend dev-frontend-local dev-frontend-cloud dev-movcli migrate-backend migrate-backend-status test test-agent-run-debugging test-agent-run-debugging-e2e test-backend typecheck-frontend typecheck-packages tidy verify-agent-run-debugging-summary verify-agent-run-debugging-summary-contract

AGENT_RUN_DEBUGGING_SUMMARY ?= apps/frontend/test-results/agent-run-debugging-acceptance-summary.json

build: build-packages build-admin build-backend build-apps build-plugins

build-admin:
	pnpm run build:admin

build-backend:
	pnpm run build:backend

build-backend-with-admin:
	pnpm run build:backend:with-admin

build-packages:
	pnpm run build:packages

build-apps:
	pnpm run build:apps

build-plugins:
	pnpm run build:plugins

build-agent:
	pnpm --filter movscript-agent build

build-movcli:
	pnpm --filter movcli build

build-frontend:
	pnpm --filter movscript-frontend build

dev-backend:
	cd apps/backend && go run ./cmd/server

migrate-backend:
	cd apps/backend && go run ./cmd/migrate up

migrate-backend-status:
	cd apps/backend && go run ./cmd/migrate status

dev-frontend:
	node scripts/run-with-env.mjs MOVSCRIPT_BACKEND_POLICY=external pnpm --filter movscript-frontend dev

dev-frontend-local: build-backend-with-admin
	node scripts/run-with-env.mjs MOVSCRIPT_BACKEND_POLICY=spawn MOVSCRIPT_AI_STREAM_DEBUG=1 pnpm --filter movscript-frontend dev

dev-frontend-cloud:
	node scripts/run-with-env.mjs MOVSCRIPT_BACKEND_POLICY=cloud pnpm --filter movscript-frontend dev

dev-agent:
	pnpm --filter movscript-agent dev

dev-movcli:
	pnpm --filter movcli dev

tidy:
	cd apps/backend && go mod tidy

test-backend:
	cd apps/backend && go test ./...

test-agent-run-debugging:
	pnpm run test:agent-run-debugging

test-agent-run-debugging-e2e:
	pnpm run test:agent-run-debugging:e2e

verify-agent-run-debugging-summary:
	node scripts/verify-agent-run-debugging-acceptance-summary.mjs $(AGENT_RUN_DEBUGGING_SUMMARY)

verify-agent-run-debugging-summary-contract:
	node scripts/verify-agent-run-debugging-acceptance-summary.mjs $(AGENT_RUN_DEBUGGING_SUMMARY) --allow-failed

typecheck-frontend:
	pnpm --filter movscript-frontend typecheck

typecheck-packages:
	pnpm -r --if-present typecheck

test: test-backend typecheck-packages test-agent-run-debugging
