.PHONY: build build-agent build-apps build-backend build-frontend build-movcli build-packages build-plugins dev-agent dev-backend dev-frontend dev-movcli test test-backend typecheck-frontend typecheck-packages tidy

build: build-backend build-packages build-apps build-plugins

build-backend:
	cd apps/backend && go build -o bin/server ./cmd/server

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

dev-frontend:
	pnpm --filter movscript-frontend dev

dev-agent:
	pnpm --filter movscript-agent dev

dev-movcli:
	pnpm --filter movcli dev

tidy:
	cd apps/backend && go mod tidy

test-backend:
	cd apps/backend && go test ./...

typecheck-frontend:
	pnpm --filter movscript-frontend typecheck

typecheck-packages:
	pnpm -r --if-present typecheck

test: test-backend typecheck-packages
