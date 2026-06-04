# MovScript Codex Plugin

Codex-native workspace plugin for MovScript.

This plugin intentionally does not use `@movscript/plugin-sdk`. Codex loads it through:

- `.codex-plugin/plugin.json`
- `skills/workspace/SKILL.md`
- `.mcp.json`

The `.mcp.json` file is a client configuration for the MovScript frontend MCP server. The frontend owns workspace files under `.movscript`, exposes file/model/review tools over MCP, and keeps backend apply behind the UI review boundary. The Agent only edits the workspace file it is given.

## Install locally

From the MovScript repo root:

```bash
pnpm codex:install-plugin
```

The installer links this plugin into the default personal Codex plugin root, writes or updates `~/.agents/plugins/marketplace.json`, enables Codex plugins in `~/.codex/config.toml`, and runs `codex plugin add movscript@personal`.
