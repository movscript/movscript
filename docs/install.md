# Installing Movscript

Movscript Desktop is distributed from GitHub Releases. The installer does not
require a Movscript-hosted server; `movscript.github.io/movscript/install.sh`
is served by GitHub Pages and the desktop package is downloaded from the
release assets.

## User Install

```bash
curl -fsSL https://movscript.github.io/movscript/install.sh | sh
```

The shell installer supports macOS Apple Silicon / arm64 and macOS Intel / x64.
It installs the matching `movscript-desktop-macos-*-Movscript.dmg` release
asset to `/Applications/Movscript.app`.

Windows x64 users should download the matching Windows installer from GitHub
Releases. The release asset is prefixed with `movscript-desktop-windows-x64-`
and ends in `.exe`. The installer lets users choose the program installation
directory.

## Options

```bash
sh install.sh --help
sh install.sh --dry-run
sh install.sh --release v0.1.15
sh install.sh --force
sh install.sh --install-dir "$HOME/Applications"
```

The installer downloads `SHA256SUMS.txt` from the same GitHub Release and
verifies the selected `.dmg` before mounting it. Use `--no-verify` only for
temporary local testing.

## Release Asset Contract

The macOS shell installer expects these release assets:

- `movscript-desktop-macos-arm64-Movscript.dmg`
- `movscript-desktop-macos-x64-Movscript.dmg`
- `SHA256SUMS.txt`

The existing release workflow collects desktop artifacts with the matrix prefix
`movscript-desktop-macos-arm64` or `movscript-desktop-macos-x64` and creates a
combined `SHA256SUMS.txt` before uploading the GitHub Release assets.

Desktop auto-update metadata is published with an architecture-specific channel
such as `latest-darwin-arm64.yml` or `latest-win32-x64.yml`. The app checks this
metadata automatically, but it never downloads or installs an update without a
user action.

Set these optional environment variables in the release job to mark an update as
required:

- `MOVSCRIPT_APP_UPDATE_POLICY=required`
- `MOVSCRIPT_APP_UPDATE_SEVERITY=security`, `data-loss`, or `startup-blocker`
- `MOVSCRIPT_APP_UPDATE_MIN_SUPPORTED_VERSION=0.1.24`
- `MOVSCRIPT_APP_UPDATE_DEADLINE_AT=2026-06-25T00:00:00.000Z`
- `MOVSCRIPT_APP_UPDATE_POLICY_TITLE` and `MOVSCRIPT_APP_UPDATE_POLICY_MESSAGE`

Required updates block normal desktop use until the user chooses to download and
restart into the update. Optional updates only show the normal update prompt.

The Windows release job publishes installer and portable artifacts with the
matrix prefix `movscript-desktop-windows-x64`. Windows ARM64 packages are
temporarily omitted until a stable ffmpeg source is available. Windows
installation location and Movscript Home are intentionally separate: the
installer controls where the app binaries live, while Movscript Home controls
user data, cache, runtime state, and generated files. By default Windows uses
`%LOCALAPPDATA%\Movscript\Home`; users can move it to a larger drive such as
`D:\MovscriptHome` from the desktop settings page.

## Publishing the GitHub Pages Installer

No server is required.

1. Enable GitHub Pages for this repository and select GitHub Actions as the
   Pages source.
2. The `Deploy Installer Page` workflow publishes `site/`, the root
   `install.sh`, and the project logo to the GitHub Pages artifact.
3. Users can run the shell installer from
   `https://movscript.github.io/movscript/install.sh`.
