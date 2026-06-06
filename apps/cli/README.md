# movcli

`movcli` is the MovScript command-line tool.

## Development

From the repository root:

```bash
pnpm install
pnpm --filter @movscript/cli exec tsx src/index.ts --help
```

Build:

```bash
pnpm --filter @movscript/cli build
```

## Global Options

```text
--server <url>        Movscript backend URL, default http://localhost:8765
--token <token>       API token, or set MOVCLI_TOKEN
--workspace <dir>     MovScript workspace root directory
```

## Auth Commands

Backend connection and credentials are stored under the selected workspace root:

```text
<workspace>/.movscript/backend/config.json
<workspace>/.movscript/backend/auth.json
```

Login:

```bash
pnpm --filter @movscript/cli dev -- --workspace /path/to/workspace auth login --server http://localhost:8765
```

Show auth status:

```bash
pnpm --filter @movscript/cli dev -- --workspace /path/to/workspace auth status
```

## Workspace Commands

Inspect a local workspace namespace:

```bash
pnpm --filter @movscript/cli dev -- workspace status --workspace /path/to/workspace --namespace movscript.project:123
```

Preview local changes and persist a review artifact:

```bash
pnpm --filter @movscript/cli dev -- workspace review --workspace /path/to/workspace --namespace movscript.project:123 --write
```

Plugin scaffolding and packaging commands have been removed.
