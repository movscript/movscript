# movcli

`movcli` is the Movscript command-line tool for plugin scaffolding/building.

## Development

From the repository root:

```bash
pnpm install
pnpm --filter movcli dev -- --help
```

Build:

```bash
pnpm --filter movcli build
```

## Global Options

```text
--server <url>        Movscript backend URL, default http://localhost:8080
--token <token>       API token, or set MOVCLI_TOKEN
```

Note: the main backend default in this repository is `http://localhost:8765`; pass `--server http://localhost:8765` when using CLI commands against the local backend.

## Plugin Commands

Scaffold a plugin project:

```bash
pnpm --filter movcli dev -- init my-plugin
pnpm --filter movcli dev -- init my-plugin --webview
```

Build a plugin package:

```bash
pnpm --filter movcli dev -- build --cwd ./my-plugin
```

`--out` defaults to `dist` inside the plugin project directory.

List a registry:

```bash
pnpm --filter movcli dev -- list --registry https://registry.movscript.com
```

Current limitation: `install` posts `.movpkg` files to `/api/v1/plugins/upload`, but the backend currently exposes `/api/v1/plugins` for JSON/path imports and does not register `/plugins/upload`.
