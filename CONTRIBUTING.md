# Contributing to Movscript

Thanks for helping improve Movscript. This project aims to keep changes easy to review, reproducible, and well documented.

## Development setup

1. Install Go 1.25+, Node.js 20+, Docker, and Docker Compose.
2. Start infrastructure:

```bash
docker compose up -d db minio createbuckets
```

3. Configure the backend:

```bash
cp backend/.env.example backend/.env
openssl rand -hex 32
```

Paste the generated value into `ENCRYPTION_KEY`.

4. Start services:

```bash
make dev-backend
make dev-frontend
```

## Before opening a pull request

Run:

```bash
make test
make build
```

Update docs when you change setup, configuration, API behavior, user-facing text, or release behavior.

## Pull request expectations

- Keep changes focused.
- Explain the user-facing behavior and validation steps.
- Add tests for backend behavior, shared logic, and bug fixes.
- For frontend text, add translation keys to both `zh-CN` and `en-US` locale files.
- Do not commit local secrets, generated binaries, or private provider credentials.

## Internationalization

Use `react-i18next` for user-facing frontend text. Prefer stable, descriptive keys such as `sidebar.items.scripts`. Backend API errors should expose stable machine-readable codes where possible; the frontend can localize those codes.
