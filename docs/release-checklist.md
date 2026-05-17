# Release Checklist

Before release, at minimum verify:

- `pnpm run typecheck`
- `pnpm run test:backend`
- `pnpm run test:agent-run-debugging`
- `pnpm --filter movscript-frontend typecheck`
- `pnpm --filter movscript-admin typecheck`
- If AgentRun debugging pages or Agent run flows changed, `pnpm run test:agent-run-debugging:e2e` passes, `agent-run-debugging-playwright-results` is archived, `agent-run-debugging-acceptance-summary.json` shows `passed: true`, and `node scripts/verify-agent-run-debugging-acceptance-summary.mjs <summary-path>` passes.
- Admin static assets are built and copied.
- Local desktop mode starts `http://localhost:8766`.
- The admin console opens at `http://localhost:8766/admin`.
- Missing model setup states guide users to model management.
- Desktop video clipping runs frontend-local ffmpeg and does not use backend compute; before release, prepare redistributable binaries according to `apps/frontend/vendor/ffmpeg/README.md`.
- The ffmpeg vendor directory contains the target platform and architecture binary: `apps/frontend/vendor/ffmpeg/darwin/arm64/ffmpeg`, `apps/frontend/vendor/ffmpeg/linux/x64/ffmpeg`, or `apps/frontend/vendor/ffmpeg/win32/x64/ffmpeg.exe`.
- The default ffmpeg source is `eugeneware/ffmpeg-static`. Use `pnpm run release:download-ffmpeg-static -- --platform=darwin|linux|win32 --arch=x64|arm64` for one supported target, or `pnpm run release:download-ffmpeg-static:matrix` for the full default matrix; the GitHub release workflow runs these download steps before checks and package jobs. The default release matrix excludes Windows ARM64 because that source does not publish a `win32 arm64` binary.
- Do not bundle Homebrew, MacPorts, Linuxbrew, apt/dnf system paths, Nix, snap, Chocolatey, Scoop, winget, or other package-manager installs; `release:stage-ffmpeg` rejects common package-manager and system locations.
- For non-default sources, set `ACTUAL_FFMPEG_RELEASE_URL` to the real upstream release page or artifact URL before staging manually.
- Manual fallback: `MOVSCRIPT_FFMPEG_BIN=/path/to/ffmpeg MOVSCRIPT_FFMPEG_SOURCE_URL=$ACTUAL_FFMPEG_RELEASE_URL MOVSCRIPT_FFMPEG_LICENSE=GPL-3.0-or-later pnpm run release:stage-ffmpeg -- --platform=darwin|linux|win32 --arch=x64|arm64`
- For cross-platform or cross-architecture staging, use `-- --platform=darwin|linux|win32 --arch=x64|arm64` or set `MOVSCRIPT_FFMPEG_PLATFORM` plus `MOVSCRIPT_FFMPEG_ARCH`; when the target platform or architecture is not the current machine, also set `MOVSCRIPT_FFMPEG_VERSION` to that binary's first `ffmpeg -version` line.
- `pnpm run release:audit-ffmpeg`
- For a cross-platform release on one target architecture, `pnpm run release:audit-ffmpeg:all`
- For a full platform and architecture release matrix, `pnpm run release:audit-ffmpeg:matrix`
- If an ffmpeg audit reports `stage with:`, run that command for each missing platform and architecture.
- `pnpm run release:check` starts with the full ffmpeg matrix audit so release CI fails before package jobs start when binaries are missing.
- `pnpm run test:release-scripts`
- `pnpm run package:desktop` or the matching explicit target command passes, such as `package:desktop:mac:x64`, `package:desktop:mac:arm64`, `package:desktop:linux:x64`, `package:desktop:linux:arm64`, or `package:desktop:win`, including `pnpm run release:verify-desktop`.
- `release:verify-desktop` confirms the packaged Electron resources include `resources/ffmpeg/<platform>/<arch>/<binary>`, validates its metadata including target architecture, and compares its hash with the staged vendor binary.
