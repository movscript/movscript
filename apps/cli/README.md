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

## Install

For a local user-wide install from this package:

```bash
pnpm --filter @movscript/cli build
apps/cli/bin/install-movcli
movcli --help
```

The installer writes a small wrapper to `~/.local/bin/movcli` by default. Use
`--bin-dir <dir>` to install somewhere else, for example:

```bash
apps/cli/bin/install-movcli --bin-dir /usr/local/bin --force
```

When MovScript Desktop is packaged, the app bundles this CLI under its resources
directory. Desktop-managed command environments prepend the bundled `movcli`
directory to `PATH`, so internal terminals and provider sessions can run
`movcli` without requiring a separate global install.

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

Inspect a local workspace model:

```bash
pnpm --filter @movscript/cli dev -- workspace get-model setting --entity-id hero --workspace /path/to/project-repo
```

Review and interpret local edits:

```bash
pnpm --filter @movscript/cli dev -- workspace review --workspace /path/to/project-repo
pnpm --filter @movscript/cli dev -- workspace interpret --workspace /path/to/project-repo
```

## Language Commands

The language/workspace command surface from the old `movscript-lang` CLI now lives in `movcli`.

```bash
pnpm --filter @movscript/cli dev -- project init --id demo --title "Demo Film"
pnpm --filter @movscript/cli dev -- project demo create --cwd ./demo
pnpm --filter @movscript/cli dev -- setting add hero --title "Hero"
pnpm --filter @movscript/cli dev -- asset add --setting hero --slot portrait --prompt "cinematic portrait"
pnpm --filter @movscript/cli dev -- language schemas
pnpm --filter @movscript/cli dev -- language schema content_unit
```

Planning and generated candidate commands are available as top-level `movcli` commands:

```bash
pnpm --filter @movscript/cli dev -- production add --id p1 --title "Demo Production"
pnpm --filter @movscript/cli dev -- segment add --production p1 --id opening --title "Opening" --order 1
pnpm --filter @movscript/cli dev -- scene-moment add --production p1 --segment opening --id phone_call --title "Phone call"
pnpm --filter @movscript/cli dev -- content-unit add --id opening_shot --title "Opening shot" --type storyboard_ref --output-kind video --scene-moment phone_call --storyboard main
pnpm --filter @movscript/cli dev -- candidate add content_units/opening_shot/content_unit.json --resource-id resource_manual_1
```

Interpreter shortcuts are also top-level commands:

```bash
pnpm --filter @movscript/cli dev -- overview --workspace /path/to/project-repo
pnpm --filter @movscript/cli dev -- inspect --workspace /path/to/project-repo
pnpm --filter @movscript/cli dev -- interpret --workspace /path/to/project-repo
pnpm --filter @movscript/cli dev -- regen plan --workspace /path/to/project-repo
pnpm --filter @movscript/cli dev -- interactive --workspace /path/to/project-repo
```

Plugin scaffolding and packaging commands have been removed.
