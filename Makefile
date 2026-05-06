.PHONY: build build-agent build-apps build-admin build-backend build-backend-with-admin build-frontend build-movcli build-packages build-plugins dev-agent dev-backend dev-frontend dev-frontend-local dev-frontend-cloud dev-movcli migrate-backend migrate-backend-status test test-backend typecheck-frontend typecheck-packages tidy

build: build-packages build-admin build-backend build-apps build-plugins

build-admin:
	pnpm --filter movscript-admin build

build-backend:
	cd apps/backend && go build -o bin/server ./cmd/server

build-backend-with-admin: build-admin build-backend
	rm -rf apps/backend/bin/admin
	cp -R apps/admin/dist apps/backend/bin/admin

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
	MOVSCRIPT_BACKEND_POLICY=external pnpm --filter movscript-frontend dev

dev-frontend-local: build-backend-with-admin
	MOVSCRIPT_BACKEND_POLICY=spawn pnpm --filter movscript-frontend dev

dev-frontend-cloud:
	MOVSCRIPT_BACKEND_POLICY=cloud pnpm --filter movscript-frontend dev

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
