# movscript

An open-source short drama production tool.

## Tech Stack

- **Backend**: Go + Gin + GORM + PostgreSQL
- **Frontend**: Electron + Vite + React + TypeScript + shadcn/ui
- **Collaboration**: Polling-based refresh

## Getting Started

### Prerequisites

- Go 1.22+
- Node.js 20+
- PostgreSQL 15+

### Backend

```bash
cd backend
cp .env.example .env   # edit DB credentials
go run ./cmd/server
# → http://localhost:8765/health
```

### Frontend

```bash
cd frontend
npm install
npm run dev   # Electron dev mode
```

### Build

```bash
make build-backend   # compiles Go binary to backend/bin/server
make build-frontend  # packages Electron app
make build           # both
```

## API

Base URL: `http://localhost:8765/api/v1`

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/scripts` | List / create scripts |
| GET/PUT/DELETE | `/scripts/:id` | Script CRUD |
| GET/POST | `/assets?type=character\|scene\|prop` | Assets |
| GET/PUT/DELETE | `/assets/:id` | Asset CRUD |
| GET/POST | `/scripts/:scriptId/episodes` | Episodes |
| PUT/DELETE | `/episodes/:id` | Episode update/delete |
| GET/POST | `/episodes/:episodeId/storyboards` | Storyboards |
| PUT/DELETE | `/storyboards/:id` | Storyboard update/delete |
| GET | `/progress` | Collaboration polling |
| GET/POST | `/users` | Users |
| GET | `/health` | Health check |

## Project Structure

```
movscript/
├── backend/          # Go API server
└── frontend/         # Electron + React app
```
