# Getting Started

This guide starts Movscript in local development mode.

## Requirements

- Go 1.25+
- Node.js 20+
- Docker and Docker Compose

## 1. Start PostgreSQL and MinIO

```bash
docker compose up -d db minio createbuckets
```

## 2. Configure the backend

```bash
cp backend/.env.example backend/.env
openssl rand -hex 32
```

Copy the generated key into `ENCRYPTION_KEY`.

## 3. Run the backend

```bash
make dev-backend
```

Verify:

```bash
curl http://localhost:8765/health
```

## 4. Run the frontend

```bash
cp frontend/.env.example frontend/.env
cd frontend
npm install
npm run dev
```

## 5. Validate the workspace

```bash
make test
make build
```
