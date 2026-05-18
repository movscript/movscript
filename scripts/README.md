# Scripts

Root scripts are workspace automation. App-only scripts should live under that app, such as `apps/agent/scripts/`.

Do not add `scripts/agent/` files. Agent-owned callable automation belongs in `apps/agent/scripts/`; test-only agent contract gates live under `tests/scripts/agent/`. Release automation lives in `scripts/release/`. One-off manual utilities are not supported; durable automation belongs in the owning package's maintained workflow.

Only cross-workspace runners and shared verifier helpers may live directly under `scripts/`:

- `run-node-tests.mjs`
- `verifier-utils.mjs`
- `verify-script-manifest.mjs`

Tests for scripts live under `tests/scripts/`, not in this directory. Keep `scripts/` limited to callable entrypoints and shared helpers.

The maintained script-file inventory is `scripts/script-manifest.json`. Supported package scripts, Makefile targets, root script files, and release subcommands are governed by `scripts/script-surfaces.json`; validate both with:

```sh
pnpm run verify:scripts
```

See `docs/script-management.md` for lifecycle rules and cleanup policy.
