# Deployment

The repository currently focuses on local desktop and development workflows.

Available build commands:

```bash
pnpm run build
pnpm run package:desktop
pnpm run package:desktop:mac:x64
pnpm run package:desktop:mac:arm64
pnpm run package:desktop:linux:x64
pnpm run package:desktop:linux:arm64
pnpm run package:desktop:win
pnpm run package:desktop:win:arm64
```

Build the backend separately with:

```bash
pnpm run build:backend
```

Before shipping a desktop package, verify that admin static assets are copied into the backend resource directory, that redistributable ffmpeg binaries are staged for the target platform and architecture, and that the local backend, SQLite database, resource storage, and admin console all work. Run `pnpm run release:audit-ffmpeg:matrix` before full matrix releases.
