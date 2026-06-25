# Scripts

Root scripts are workspace automation. App-only scripts should live under the app or package that owns them.

Release automation lives in `scripts/release/`. App-only automation belongs in the owning package's `scripts/` directory.

Desktop package resources are governed by `package-resources.manifest.json`.
Run `pnpm run verify:package-resources` after changing `apps/desktop/electron-builder.yml`,
desktop runtime binaries, plugin bundle layout, or release staging paths.

## Release signing modes

Movscript release packaging has two explicit signing modes:

- `unsigned`: the current default for preview builds. macOS packages disable
  Developer ID signing and notarization, strip Electron Builder signing
  secrets from the package environment, and still run package verification,
  smoke tests, checksums, and artifact collection.
- `signed`: the future public distribution path. It requires platform signing
  credentials through `verify-release-readiness` and uses the normal
  Electron Builder signing/notarization configuration.

Use `pnpm run release:dry-run -- --platform=darwin --arch=arm64` to exercise
the unsigned package path locally. Set `MOVSCRIPT_RELEASE_SIGNING_MODE=signed`
or pass `--signed` only when Developer ID / notarization credentials are ready.

Use `pnpm run release:check` before packaging or tagging a release. It is the
shared local/CI quality gate: release readiness, workspace typecheck,
workspace tests, script/release tests, UI quality, frontend quality, package
resource verification, and release workflow tests all run from the same release
workflow entrypoint. Target-specific desktop assets such as ffmpeg are downloaded
and verified inside each `release full` / package job before packaging and smoke
testing that target.

Only cross-workspace runners, shared verifier helpers, and SDK runtime preparation entrypoints may live directly under `scripts/`:

- `run-node-tests.mjs`
- `verifier-utils.mjs`
- `prepare-sdk-runtime-seed.mjs`
- `smoke-sdk-runtimes.mjs`
- `movscript-lang-deps.mjs`
- `movscript-lang-cwd.mjs`

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
