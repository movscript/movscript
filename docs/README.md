# Movscript Documentation

This is the only public documentation entry point for Movscript. Machine-readable contracts live in `contracts/`; design history and maintainer notes live in `memory/`.

## Quick Start

Install dependencies and start the local desktop workflow:

```bash
pnpm install
make dev-frontend-local
```

Local mode lets Electron start the backend at `http://localhost:8766`, uses SQLite and filesystem storage, and serves the admin console at `http://localhost:8766/admin`.

For split backend/frontend development:

```bash
pnpm --filter movscript-backend dev
pnpm --filter movscript-frontend dev
curl http://localhost:8765/health
```

Start the local Agent when working on agent flows:

```bash
pnpm --filter movscript-agent dev
```

## Configuration

Local desktop mode sets `MOVSCRIPT_BACKEND_POLICY=spawn`. The default external backend URL is `http://localhost:8765`; backend environment variables are documented in `apps/backend/.env.example`.
To run local desktop mode against an external Agent service, reuse the same entry point with `MOVSCRIPT_AGENT_POLICY=external make dev-frontend-local`.

Common local backend settings:

```env
MOVSCRIPT_APP_MODE=local
DB_DRIVER=sqlite
DB_PATH=$HOME/.movscript/movscript.db
STORAGE_BACKEND=filesystem
MOVSCRIPT_DATA_DIR=$HOME/.movscript
```

Provider credentials, enabled models, model capabilities, pricing, parameters, and feature routing are configured in the admin console. If generation reports no usable model, check that both the credential and the model are enabled.

## Architecture

Movscript is a local-first desktop workspace with four main applications:

- `apps/frontend`: Electron + React desktop client.
- `apps/backend`: Go API, database, jobs, storage, and AI gateway.
- `apps/admin`: admin console for credentials, models, routing, users, and resources.
- `apps/agent`: local Agent service for threads, runs, plans, drafts, memory, and traces.

Runtime boundaries:

- The backend stores formal project data and provider credentials.
- The desktop app owns active UI context and exposes local integration surfaces.
- The Agent owns local run state, drafts, memory, and trace data.
- Shared behavior should go through APIs, IPC, or clearly shared packages.

## API

Backend APIs are mounted under `/api/v1`.

- External backend development: `http://localhost:8765/api/v1`
- Frontend-managed local mode: `http://localhost:8766/api/v1`

Common public surfaces include auth, projects, resources, generation jobs, model listing, and feature configuration. Admin APIs live under `/api/v1/admin/*` and require `super_admin`.

OpenAI-compatible routes:

```text
/v1/models
/v1/chat/completions
```

OpenAPI and other machine-readable contracts belong in `contracts/`, not in `docs/`.

## Development

Common commands:

```bash
pnpm install
make dev-frontend-local
pnpm --filter movscript-backend dev
pnpm --filter movscript-frontend dev
pnpm --filter movscript-agent dev
pnpm run typecheck
pnpm --filter movscript-backend test
pnpm run test:contracts
pnpm run test:scripts
pnpm run verify:scripts
```

Plugin-related code lives in `apps/movcli`, `packages/plugin-sdk`, and `plugins/*`. Use `pnpm --filter movcli dev` and `pnpm --filter "./plugins/*" build` when working on plugin packaging.

Script ownership and lifecycle policy is documented in [Script Management](./script-management.md). Update `scripts/script-manifest.json` whenever a repository automation script is added, moved, or deleted.

AI-generated media enters review through candidate sets, not direct binding. The candidate rules for asset slots, keyframes, and future visual anchors are documented in [Candidate Workflow](./candidate-workflow.md).

The responsibility boundary between Agent Settings, Agent Debug, and conversation details is documented in [Agent Settings And Debug Boundaries](./agent-settings-debug.md).
Stable Agent Debug Bundle and Agent Settings Snapshot schemas are documented in [Agent Schema Reference](./agent-schema-reference.md).

## Release And Deployment

The repository currently focuses on local desktop and development workflows.

Build and package commands:

```bash
pnpm run build
pnpm run release -- package-desktop
pnpm run release -- package-desktop --platform=darwin --arch=arm64
pnpm run release -- package-desktop --platform=linux --arch=x64
pnpm run release -- package-desktop --platform=win32 --arch=x64
```

Before release, verify at minimum:

- `pnpm run typecheck`
- `pnpm --filter movscript-backend test`
- `pnpm run test:contracts`
- `pnpm --filter movscript-frontend typecheck`
- `pnpm --filter movscript-admin typecheck`
- `pnpm run verify:scripts`
- `pnpm run test:scripts`
- `pnpm run release -- audit-ffmpeg --all --all-archs`
- The admin static assets are built and copied.
- Local desktop mode starts `http://localhost:8766`.
- The admin console opens at `http://localhost:8766/admin`.
- Desktop video clipping uses staged redistributable ffmpeg binaries from `apps/frontend/vendor/ffmpeg`.

For AgentRun debugging changes that specifically need browser or screenshot coverage, run `make test-agent-run-debugging-e2e` manually in an environment that can launch Chromium.

## Troubleshooting

Local backend fails to start:

- Confirm App Settings use Local Launch.
- Click Retry Start in the startup failure overlay.
- In development, use `make dev-frontend-local`.

Admin console does not open:

- Check `curl http://localhost:8766/health`.
- Use `http://localhost:8766/admin`.
- In external backend mode, make sure the backend can find the admin static assets.

No usable model:

- Open `http://localhost:8766/admin/models`.
- Add provider credentials and enable models.
- Confirm both the credential and model are enabled.

Video clipping cannot find ffmpeg:

- Local clipping only runs in the desktop app.
- Packaged apps look under `resources/ffmpeg/<platform>/<arch>/<binary>`.
- Development builds can use `FFMPEG_PATH`, `MOVSCRIPT_FFMPEG_PATH`, or an `ffmpeg` binary on `PATH`.
- Release builds must stage redistributable binaries with `pnpm run release -- stage-ffmpeg` or `pnpm run release -- download-ffmpeg-static`.
