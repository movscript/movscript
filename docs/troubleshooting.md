# Troubleshooting

## Local Backend Fails To Start

- Confirm App Settings are set to Local Launch.
- Click Retry Start in the startup failure overlay.
- In development, use `make dev-frontend-local`; it builds the backend and admin UI before starting Electron.

## Admin Console Does Not Open

- Confirm the local backend health check works: `curl http://localhost:8766/health`.
- Confirm the admin console URL is `http://localhost:8766/admin`.
- If you use an external backend, make sure the backend can find the admin static assets.

## No Usable Model

- Open `http://localhost:8766/admin/models`.
- Add provider credentials and enable models.
- Confirm both the credential and model are enabled.

## Video Clipping Cannot Find ffmpeg

- Local clipping only runs in the desktop app. Browser-only sessions cannot start the local clipping process.
- If the clip dialog says ffmpeg is missing, check the expected bundle path shown in the dialog. Packaged apps look under `resources/ffmpeg/<platform>/<arch>/<binary>`.
- Development builds can use `FFMPEG_PATH`, `MOVSCRIPT_FFMPEG_PATH`, or an `ffmpeg` binary on `PATH`.
- Release builds should not point at Homebrew, MacPorts, Linuxbrew, apt/dnf, Nix, snap, Chocolatey, Scoop, winget, or other package-manager installs. Stage an explicitly redistributable binary with `pnpm run release:stage-ffmpeg`.
- `MOVSCRIPT_FFMPEG_BIN` can point at the actual `ffmpeg` / `ffmpeg.exe` executable, or at an extracted binary build directory that contains it. It cannot point at an FFmpeg source tree; Movscript does not compile FFmpeg from source during staging or release.
- To check a downloaded archive before staging metadata is ready, run `MOVSCRIPT_FFMPEG_BIN=/path/to/extracted-binary-dir pnpm run release:inspect-ffmpeg -- --platform=darwin --arch=arm64`. The command prints which executable staging would use.
- Run `pnpm run release:audit-ffmpeg:matrix` before release. If it prints `stage with:`, run the suggested `release:download-ffmpeg-static` command for each missing platform and architecture.
