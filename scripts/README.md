# Scripts

Root scripts are workspace automation. App-only scripts should live under that app, such as `apps/agent/scripts/`.

Release automation lives in `scripts/release/`. App-only automation belongs in the owning package's `scripts/` directory.

Only cross-workspace runners and shared verifier helpers may live directly under `scripts/`:

- `run-node-tests.mjs`
- `verifier-utils.mjs`

Tests for scripts live under `tests/scripts/`, not in this directory. Keep `scripts/` limited to callable entrypoints and shared helpers.

## TypeScript test dependency diagnostics

`run-node-tests.mjs` runs `.ts` and `.tsx` tests through `node --import tsx`.
If it reports that `tsx` cannot be resolved, first restore workspace links:

```sh
pnpm install --ignore-scripts
```

For offline workspaces, hydrate every missing tarball reported by pnpm and then
rerun the install:

```sh
pnpm store add <package>@<version>
pnpm install --offline --ignore-scripts
```

The runner distinguishes common incomplete-install states: missing
`node_modules/.bin`, missing top-level package links, and incomplete pnpm store
entries such as `node_modules/.pnpm/tsx@.../node_modules/tsx`.
