# Installing Movscript

Movscript publishes two app releases from GitHub Releases:

- Agent Plugin, installed with `install-plugin.sh`.
- Desktop App, installed with `install-desktop.sh` on macOS or downloaded as a
  desktop installer from GitHub Releases.

The installers do not require a Movscript-hosted server. The shell scripts are
served by GitHub Pages and packages are downloaded from release assets.

## GitHub Pages Install Surface

The GitHub Pages page must present two primary install paths and keep them
separate:

| Path | User intent | Primary action | Release asset |
| --- | --- | --- | --- |
| Agent Plugin only | Use Movscript from Codex or another Agent provider without installing Desktop | `curl -fsSL https://movscript.github.io/movscript/install-plugin.sh \| sh` | `movscript-agent-plugin-<version>.zip` |
| Desktop App | Install the local visual workspace that reuses the local runtime daemon | macOS: `curl -fsSL https://movscript.github.io/movscript/install-desktop.sh \| sh`; Windows: download the `.exe` installer | `movscript-desktop-<platform>-<arch>-*` |

The page is the user-facing install surface, so the split must be visible before
users reach GitHub Releases:

- The first path is "Agent Plugin only" and exposes the plugin command directly.
  It must say that Desktop is not installed or launched.
- The second path is "Desktop App" and exposes the macOS desktop command plus
  direct desktop downloads. It must say that Desktop reuses the same
  `movscript.local-node` daemon as Agent Plugin and CLI when local execution is
  needed.
- macOS can use a shell installer because it can choose the matching DMG from
  the current machine architecture. Windows should link to the `.exe` release
  asset until a Windows shell installer is intentionally designed.
- The page may resolve latest release metadata and point buttons at exact assets.
  If release metadata is unavailable, it should direct users to GitHub Releases
  for manual download.

The page may also link to GitHub Releases for manual downloads, but the two
primary paths above are the canonical user-facing entry points. `install.sh`
is not a public or documented user entry point. If it still exists during the
hard migration, it can only be an internal shared implementation behind
`install-desktop.sh`, and public references should be removed.

## Agent Plugin Install

```bash
curl -fsSL https://movscript.github.io/movscript/install-plugin.sh | sh
```

The plugin installer downloads `movscript-agent-plugin-*.zip`, verifies it with
`SHA256SUMS.txt`, installs it into `$MOVSCRIPT_HOME/plugins/movscript/<version>`,
and writes a Codex marketplace registration under `$MOVSCRIPT_HOME/provider/codex`.
It does not install or launch the Desktop app.

For local development, build and install the current workspace package directly:

```bash
pnpm run release:package:plugin
sh install-plugin.sh --local-zip plugins/movscript/release/movscript-agent-plugin-0.1.29.zip
```

The local zip contains the Agent Plugin entrypoint plus the local runtime daemon
assets needed for no-Desktop usage: Data Service binary, Local Surface Host
static build, and bundled service launchers. The first local data-plane daemon
startup persists Data Service state under `$MOVSCRIPT_HOME/data-service`.
Cloud or external data-plane daemon startup does not launch the local Data
Service, but still starts local Project, Editing, Canvas, Surface, and Media
services. The background `movscript.local-node` daemon is independent from the
Codex conversation and is shared by Agent Plugin, Desktop, CLI, and MCP
sessions. It does not shut down automatically by default; stop or restart it
explicitly before local development updates, plugin reinstall, or port cleanup.
The installer attempts to stop an existing local-node before replacing the
`current` plugin link.

Useful daemon controls:

```bash
~/.movscript/plugins/movscript/current/bin/movscript daemon status
~/.movscript/plugins/movscript/current/bin/movscript daemon stop
~/.movscript/plugins/movscript/current/bin/movscript daemon restart
```

For Codex-installed development cache builds, run the same commands from the
installed cache root's `bin/movscript`. The older
`bin/movscript-agent-mcp local-node ...` form remains a compatibility alias.
Inside an agent session, the same controls are exposed as
`runtime_local_daemon_status`, `runtime_local_daemon_stop`, and
`runtime_local_daemon_restart`; the old `runtime_local_node_*` tools remain
compatibility aliases.

This path is for users who want an Agent/provider entry first. At runtime the
plugin, Desktop, and CLI discover the same local daemon through Movscript Home,
but the installer itself remains plugin-only.

## Desktop Install

```bash
curl -fsSL https://movscript.github.io/movscript/install-desktop.sh | sh
```

The desktop shell installer supports macOS Apple Silicon / arm64 and macOS Intel / x64.
It installs the matching `movscript-desktop-macos-*-Movscript.dmg` release
asset to `/Applications/Movscript.app`.

`install-desktop.sh` is the canonical public command. It may delegate to shared
desktop installer implementation internally, but documentation, GitHub Pages,
and release notes should point users at `install-desktop.sh` instead of
`install.sh`.

Windows x64 users should download the matching Windows installer from GitHub
Releases. The release asset is prefixed with `movscript-desktop-windows-x64-`
and ends in `.exe`. The installer lets users choose the program installation
directory.

## Options

```bash
sh install-plugin.sh --help
sh install-plugin.sh --dry-run
sh install-plugin.sh --release v0.1.29
sh install-plugin.sh --local-zip plugins/movscript/release/movscript-agent-plugin-0.1.29.zip

sh install-desktop.sh --help
sh install-desktop.sh --dry-run
sh install-desktop.sh --release v0.1.29
sh install-desktop.sh --force
sh install-desktop.sh --install-dir "$HOME/Applications"
```

Both installers download `SHA256SUMS.txt` from the same GitHub Release and
verify the selected package before installing it. Use `--no-verify` only for
temporary local testing.

## Release Asset Contract

The plugin installer expects:

- `movscript-agent-plugin-<version>.zip`
- `SHA256SUMS.txt`

The macOS desktop shell installer expects these release assets:

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
   installer scripts, and the project logo to the GitHub Pages artifact.
3. Users can run the Agent Plugin installer from
   `https://movscript.github.io/movscript/install-plugin.sh` or the Desktop
   installer from `https://movscript.github.io/movscript/install-desktop.sh`.
