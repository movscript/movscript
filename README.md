<p align="center">
  <img src="assets/logo.png" alt="Movscript" width="96" />
</p>

<h1 align="center">Movscript</h1>

<p align="center">
  Video creation for Vibe Motion, AI-planned production, and automatic editing.
</p>

<p align="center">
  <a href="README.zh-CN.md">简体中文</a> | English
</p>

<p align="center">
  <a href="#overview">Overview</a> |
  <a href="#downloads">Downloads</a> |
  <a href="#docker">Docker</a>
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue" />
</p>

## Overview

Movscript helps creators turn scripts, references, and creative direction into a plannable, editable, previewable video workflow. It is built around describing the intent, feeling, rhythm, and structure of motion instead of starting from timelines and keyframes.

The public distribution currently focuses on desktop video creation workflows: project planning, scripts, assets, storyboards, shots, generation jobs, model configuration, assistant workflows, and rough-cut assembly.

Movscript is still early. Features, file formats, plugin behavior, and workflows may change before a stable release.

## Downloads

### Agent Plugin

Install only the Movscript Agent Plugin when you want to use Movscript from Codex or another Agent provider without installing Desktop:

```bash
curl -fsSL https://movscript.github.io/movscript/install-plugin.sh | sh
```

The plugin package is downloaded from [GitHub Releases](https://github.com/movscript/movscript/releases/latest). It does not install or launch the Desktop app.

### Desktop App

Current desktop release target:

- macOS Apple Silicon / arm64
- macOS Intel / x64
- Windows x64
- Linux x64 AppImage

Download the latest desktop package from [GitHub Releases](https://github.com/movscript/movscript/releases/latest).

On macOS, install from the command line. The installer picks the Apple Silicon or Intel DMG based on your machine:

```bash
curl -fsSL https://movscript.github.io/movscript/install-desktop.sh | sh
```

On Windows, download the latest x64 `.exe` installer from [GitHub Releases](https://github.com/movscript/movscript/releases/latest).

On Linux, download the latest x64 `.AppImage`, mark it executable, and open it from your desktop environment or terminal.

All release notes, known issues, checksums, and previous versions are listed on the [Movscript releases page](https://github.com/movscript/movscript/releases).

## Docker

The Docker setup runs the backend service stack for integration and deployment testing. It is not a replacement for the desktop app.

Included services:

- Backend API
- PostgreSQL
- MinIO
- Redis
- Gitea
- Optional Prometheus and Grafana observability stack

### Start Services

```bash
docker compose up -d --build
```

Default local endpoints:

| Service | URL |
| --- | --- |
| Backend API | `http://localhost:8765` |
| MinIO Console | `http://localhost:9001` |
| Gitea | `http://localhost:3003` |

### Start Observability

```bash
docker compose --profile observability up -d --build
```

Default observability endpoints:

| Service | URL |
| --- | --- |
| Grafana | `http://localhost:3002` |
| Prometheus | `http://localhost:9091` |

### Stop Services

```bash
docker compose down
```

Remove local Docker volumes as well:

```bash
docker compose down -v
```

## Docs

- [Product positioning and agent workflow](docs/product-positioning-agent-workflow.zh-CN.md)
- [MovScript skill workflow](docs/movscript-skill-workflow.md)
- [Product transformation plan](docs/product-transformation-plan.zh-CN.md)
- [Install surface and release assets](docs/install.md)
- [Product runtime distribution standard](docs/product-runtime-distribution-standard.zh-CN.md)
- [Movscript Agent runtime architecture](docs/movscript-agent-runtime-architecture.zh-CN.md)
- [Model adapter route/provider architecture](docs/model-adapter-route-provider-architecture.zh-CN.md)
- [Shell frontend design](docs/shell-frontend-design.zh-CN.md)
- [Shell session integration](docs/shell-session-integration.zh-CN.md)

## License

Movscript is licensed under the [Apache License 2.0](LICENSE).
