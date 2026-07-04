# Install And Distribution Contract

Use this reference when explaining MovScript installation, release packaging, MovScript Home, rollback, or cloud/external runtime configuration.

## Install Surfaces

MovScript publishes two user-facing release paths from GitHub Releases:

| Path | User intent | Primary action | Release asset |
| --- | --- | --- | --- |
| Agent Plugin only | Use MovScript from Codex or another agent provider without Desktop | `curl -fsSL https://movscript.github.io/movscript/install-plugin.sh | sh` | `movscript-agent-plugin-<version>.zip` |
| Desktop App | Install the visual workspace that reuses the local runtime daemon | macOS: `curl -fsSL https://movscript.github.io/movscript/install-desktop.sh | sh`; Windows: download `.exe`; Linux: download `.AppImage` | `movscript-desktop-<platform>-<arch>-*` |

Keep these paths separate. The plugin installer installs only the Agent Plugin package. It does not install or launch Desktop.

Desktop, Agent Plugin, and CLI reuse the same `movscript.local-node` / local runtime daemon when local execution is needed. The daemon is shared runtime infrastructure, not a separate public download.

## Agent Plugin Install

```bash
curl -fsSL https://movscript.github.io/movscript/install-plugin.sh | sh
```

The installer downloads `movscript-agent-plugin-*.zip`, verifies it with `SHA256SUMS.txt`, installs it under `$MOVSCRIPT_HOME/plugins/movscript/<version>`, updates `$MOVSCRIPT_HOME/plugins/movscript/current`, writes the CLI shim under `$MOVSCRIPT_HOME/bin`, and writes provider registration for the selected provider.

It also writes `$MOVSCRIPT_HOME/plugins/movscript/current.identity`, keeps the current and previous bundles by default, and supports rollback. If the current plugin bundle cannot start the local daemon, the ensure path may switch `current` back to `previous`, rewrite `current.identity`, and retry daemon startup from the previous bundle.

Useful controls:

```bash
sh install-plugin.sh --local-zip plugins/movscript/release/movscript-agent-plugin-0.1.30.zip
sh install-plugin.sh --retain 3
sh install-plugin.sh --rollback
sh install-plugin.sh --rollback-version 0.1.30
```

## MovScript Home

Default local installs use one MovScript Home shared by Desktop, Agent Plugin, and CLI:

- macOS/Linux: `~/.movscript`
- Windows: `%LOCALAPPDATA%\MovScript\Home`

Set `MOVSCRIPT_HOME` only when intentionally using a separate local data root. Self-managed or custom distribution profiles must use a separate Home, such as `~/.movscript-self-hosted` or `%LOCALAPPDATA%\MovScript Self Hosted\Home`, so local databases, provider credentials, runtime endpoint records, and plugin bundles do not mix with the default local install.

## Desktop Install

```bash
curl -fsSL https://movscript.github.io/movscript/install-desktop.sh | sh
```

The desktop shell installer supports macOS Apple Silicon / arm64 and macOS Intel / x64. Windows x64 users should download the matching `.exe` from GitHub Releases. Linux x64 users should download the matching `.AppImage`, mark it executable, and open it from the desktop environment or terminal.

## Cloud Or External Runtime

Desktop, Agent Plugin, and CLI can connect to a cloud or external runtime gateway without changing product install shape. Register the gateway in the selected MovScript Home, then confirm status:

```bash
movscript runtime gateway configure --gateway-base-url https://runtime.example.com --gateway-kind cloud --json
movscript runtime gateway status --json
```

Use `--gateway-kind external` for a self-managed runtime gateway. Cloud/external mode changes the data plane behind the runtime descriptor; it does not make `plugin-basic` a separate product and should not require Desktop when Agent Plugin can run full-local.

## Release Asset Contract

The plugin installer expects:

- `movscript-agent-plugin-<version>.zip`
- `SHA256SUMS.txt`

The macOS desktop shell installer expects:

- `movscript-desktop-macos-arm64-*.dmg`
- `movscript-desktop-macos-x64-*.dmg`
- `SHA256SUMS.txt`

Windows x64 packages use the `movscript-desktop-windows-x64-*` prefix. Linux x64 AppImage packages use the `movscript-desktop-linux-x64-*` prefix.
