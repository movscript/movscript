# Installing Movscript

Movscript publishes two app releases from GitHub Releases:

- Agent Plugin, installed with `install-plugin.sh`.
- Desktop App, installed with `install-desktop.sh` on macOS or downloaded as a desktop installer/AppImage from GitHub Releases.

The installers do not require a Movscript-hosted server. The shell scripts are served by GitHub Pages and packages are downloaded from release assets.

## GitHub Pages Install Surface

The GitHub Pages page must present two primary install paths and keep them separate:

| Path | User intent | Primary action | Release asset |
| --- | --- | --- | --- |
| Agent Plugin only | Use Movscript from Codex or another Agent provider without installing Desktop | `curl -fsSL https://movscript.github.io/movscript/install-plugin.sh \| sh` | `movscript-agent-plugin-<version>.zip` |
| Desktop App | Install the local visual workspace that reuses the local runtime daemon | macOS: `curl -fsSL https://movscript.github.io/movscript/install-desktop.sh \| sh`; Windows: download the `.exe` installer; Linux: download the `.AppImage` | `movscript-desktop-<platform>-<arch>-*` |

The plugin installer only installs the Agent Plugin package. It does not install or launch the Desktop app.

Desktop reuses the same `movscript.local-node` daemon as Agent Plugin and CLI when local execution is needed. The daemon is shared runtime infrastructure, not a separate public download.

## Agent Package / Agent Plugin Install

```bash
curl -fsSL https://movscript.github.io/movscript/install-plugin.sh | sh
```

The plugin installer downloads `movscript-agent-plugin-*.zip`, verifies it with `SHA256SUMS.txt`, requires the neutral `.agent-package/package.json` manifest, installs it into `$MOVSCRIPT_HOME/plugins/movscript/<version>`, points `$MOVSCRIPT_HOME/plugins/movscript/current` at that bundle, writes the shared CLI shim under `$MOVSCRIPT_HOME/bin`, and writes provider registrations for the selected target providers. It also writes `$MOVSCRIPT_HOME/plugins/movscript/current.identity` and keeps the current plus previous bundle by default so `sh install-plugin.sh --rollback` can switch back without reinstalling Desktop. If the current plugin bundle cannot start the local daemon, the plugin ensure path automatically switches `current` back to `previous`, rewrites `current.identity`, and retries daemon startup from the previous bundle.

Useful plugin install controls:

```bash
sh install-plugin.sh --local-zip plugins/movscript/release/movscript-agent-plugin-0.1.30.zip
sh install-plugin.sh --provider codex,claude-code,openclaw,harness
sh install-plugin.sh --provider all
sh install-plugin.sh --retain 3
sh install-plugin.sh --rollback
sh install-plugin.sh --rollback-version 0.1.30
```

This path is for users who want an Agent/provider entry first. The shared package remains one installed Home bundle; each provider target gets a small projection under `$MOVSCRIPT_HOME/provider/<target>`:

| Target | Projection |
| --- | --- |
| `codex` | `marketplace.json` plus `plugins/movscript -> Home current` |
| `claude-code` | `.mcp.json` plus `registration.json` |
| `openclaw` | `mcp.json` plus `registration.json` |
| `harness` | `worker-agent.json` plus `registration.json` |

`xiaolongxia` is accepted as an alias for `openclaw`.

## MovScript Home And Distribution Profiles

Default local installs use one MovScript Home shared by Desktop, Agent Plugin, and CLI:

- macOS/Linux: `~/.movscript`
- Windows: `%LOCALAPPDATA%\MovScript\Home`

Set `MOVSCRIPT_HOME` only when you intentionally want a separate local data root. Self-managed or custom distribution profiles must use a separate Home, such as `~/.movscript-self-hosted` on macOS/Linux or `%LOCALAPPDATA%\MovScript Self Hosted\Home` on Windows, so local databases, provider credentials, runtime endpoint records, and plugin bundles do not mix with the default local install.

## Desktop Install

```bash
curl -fsSL https://movscript.github.io/movscript/install-desktop.sh | sh
```

The desktop shell installer supports macOS Apple Silicon / arm64 and macOS Intel / x64. Windows x64 users should download the matching `.exe` installer from GitHub Releases. Linux x64 users should download the matching `.AppImage`, mark it executable, and open it from their desktop environment or terminal.

## Cloud Or External Runtime

Desktop, Agent Plugin, and CLI can connect to a cloud or external runtime gateway without changing product install shape. Register the gateway in the selected MovScript Home, then confirm status:

```bash
movscript runtime gateway configure --gateway-base-url https://runtime.example.com --gateway-kind cloud --json
movscript runtime gateway status --json
```

Use `--gateway-kind external` for a self-managed runtime gateway. Cloud/external mode changes the data plane behind the runtime descriptor; it does not make `plugin-basic` a separate product, and it should not require Desktop when the Agent Plugin can run full-local.

## Release Asset Contract

The plugin installer expects:

- `movscript-agent-plugin-<version>.zip`
- `SHA256SUMS.txt`

The macOS desktop shell installer expects:

- `movscript-desktop-macos-arm64-*.dmg`
- `movscript-desktop-macos-x64-*.dmg`
- `SHA256SUMS.txt`

Windows x64 packages use the `movscript-desktop-windows-x64-*` prefix. Linux x64 AppImage packages use the `movscript-desktop-linux-x64-*` prefix.
