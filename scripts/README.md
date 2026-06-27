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

Use `pnpm run check` before opening a PR. It is the shared workspace gate:
generated path contracts, workspace package contracts, plugin distribution
sync, runtime registry, script and architecture boundary tests, workspace
typecheck, build, package tests, desktop tests, UI quality, frontend quality,
and package resource verification.

Use `pnpm run release:check` before packaging or tagging a release. It extends
the workspace gate with release readiness and the stable backend release gate
(`pnpm run check:backend`) through the same release workflow entrypoint.
Target-specific desktop assets such as ffmpeg are downloaded and verified
inside each `release full` / package job before packaging and smoke testing
that target.

The backend release gate runs data-service unit tests and the explicit model
capability contract. Broader Go architecture checks are still available as
`pnpm --filter @movscript/data-service run test:architecture`, but they track
backend boundary debt separately from the user-facing release readiness gate.

Public GitHub Releases have two user-facing product tracks:

- Agent Plugin only: `movscript-agent-plugin-<version>.zip`, installed through
  `install-plugin.sh` and usable without installing Desktop.
- Desktop App: `movscript-desktop-<platform>-<arch>-*`, installed through
  `install-desktop.sh` on macOS or downloaded as a desktop installer.

`movscript.local-node` is a shared runtime component behind those two packages,
not a third public release track.

Only cross-workspace runners, shared verifier helpers, and SDK runtime preparation entrypoints may live directly under `scripts/`:

- `run-node-tests.mjs`
- `verifier-utils.mjs`
- `check-generated-paths.mjs`
- `check-plugin-distribution.mjs`
- `check-workspace-packages.mjs`
- `clean-generated.mjs`
- `prepare-sdk-runtime-seed.mjs`
- `smoke-sdk-runtimes.mjs`
- `movscript-lang-deps.mjs`
- `movscript-lang-cwd.mjs`

Tests for scripts and cross-workspace architecture boundaries live under
`tests/scripts/`, not in this directory. Keep `scripts/` limited to callable
entrypoints and shared helpers.

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
