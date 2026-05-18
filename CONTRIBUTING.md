# Contributing to Movscript

[简体中文](CONTRIBUTING.zh-CN.md)

Thanks for helping improve Movscript. The project values focused changes, reproducible validation, and documentation that matches the code being shipped.

## Development Setup

Install Go 1.25+, Node.js 20+, pnpm 10+, Docker, and Docker Compose.

```bash
pnpm install
docker compose up -d db minio createbuckets
cp apps/backend/.env.example apps/backend/.env
openssl rand -hex 32
```

Paste the generated value into `ENCRYPTION_KEY` in `apps/backend/.env`.

Run the main development services:

```bash
pnpm --filter movscript-backend dev
pnpm --filter movscript-frontend dev
```

Optional local agent:

```bash
pnpm --filter movscript-agent dev
```

## Before Opening a Pull Request

Run the relevant checks:

```bash
pnpm run test
pnpm run build
```

For small frontend-only changes, at minimum run:

```bash
pnpm --filter movscript-frontend typecheck
```

For backend changes, run:

```bash
cd apps/backend
go test ./...
```

## Pull Request Expectations

- Keep changes focused and explain the user-facing behavior.
- Include validation steps in the PR description.
- Add or update tests for backend behavior, shared logic, and bug fixes.
- Update documentation when setup, configuration, API behavior, release behavior, or user-facing workflows change.
- Do not commit local secrets, generated binaries, private provider credentials, or local database/object-storage data.

## Documentation Standards

- Keep public docs in `docs/`; keep design history and maintainer-only context in `memory/`.
- Keep machine-readable contracts and fixtures in `contracts/`, not in `docs/`.
- Prefer updating the consolidated docs index instead of adding narrow one-off guides.
- Document current behavior first. If a section describes a proposal, move it to `memory/` or label it clearly.

## Internationalization

The frontend uses `react-i18next`.

- Add user-facing frontend strings to both `apps/frontend/src/i18n/locales/zh-CN.json` and `apps/frontend/src/i18n/locales/en-US.json`.
- Use stable keys grouped by product area, for example `sidebar.items.scripts`.
- Keep backend API errors machine-readable where possible; localize display text in the frontend.
