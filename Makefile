.PHONY: build build-backend build-frontend dev-backend dev-frontend test test-backend typecheck-frontend tidy

build: build-backend build-frontend

build-backend:
	cd backend && go build -o bin/server ./cmd/server

build-frontend:
	cd frontend && npm run build

dev-backend:
	cd backend && go run ./cmd/server

dev-frontend:
	cd frontend && npm run dev

tidy:
	cd backend && go mod tidy

test-backend:
	cd backend && go test ./...

typecheck-frontend:
	cd frontend && npm run typecheck

test: test-backend typecheck-frontend
