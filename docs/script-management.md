# Script Management

This repository treats scripts as maintained automation, not as an informal dumping ground.

## Inventory

The canonical inventory is `scripts/script-manifest.json`. Every `.mjs` and `.py` script under the governed script roots must have an entry. Governed roots currently include `scripts/`, `apps/agent/scripts/`, `apps/backend/scripts/`, and `apps/frontend/scripts/`.

- `category`: `build`, `contract`, `dev`, `release`, or `test`
- `lifecycle`: `maintained`
- `owner`: the subsystem responsible for behavior and cleanup decisions
- `purpose`: the reason the script exists
- `entrypoint`: the preferred command or import mode
- `invokedBy`: package scripts, source files, CI, docs, or other maintained workflows that call it
- `tests`: the verifier or command that covers behavior

Run the inventory gate with:

```sh
pnpm run verify:scripts
```

`pnpm run release -- check` runs this gate before release validation.

Direct files under `scripts/` are intentionally limited to cross-workspace runners and shared verifier helpers: `run-node-tests.mjs`, `verifier-utils.mjs`, and `verify-script-manifest.mjs`. Release automation belongs in `scripts/release/`; app-owned automation belongs in the owning package's `scripts/` directory.

The root `Makefile` is also treated as a curated human entrypoint surface, not a mirror of every package script. Keep app-specific build, dev, migration, tidy, and narrow typecheck commands in the owning package. The script verifier rejects package-owned aliases such as root `build-backend`, `dev-agent`, `migrate-backend`, or `tidy` targets.

Frontend generation contract tests are grouped behind `apps/frontend/package.json` `test:generation-contract`. Add focused Node test files to the `generation-contract` suite instead of reintroducing single-file aliases such as `test:generation-ui`, `test:generation-replay`, or `test:model-contract`.

Root and workspace package `package.json` scripts are governed by explicit allowlists in `scripts/script-surfaces.json` and enforced by `pnpm run verify:scripts`. Script files are governed by the canonical inventory in `scripts/script-manifest.json`, with `scripts/script-surfaces.json` `maxMaintainedScriptFiles` acting as the explicit automation budget. Release subcommands are governed by `scripts/script-surfaces.json`; `scripts/release/release-workflow.mjs` loads its public subcommand map from the same file. Adding a new script entry should be treated as adding a supported public command: update the manifest, surface config when a command name changes, verifier tests, and this document only when the command is intentionally part of the maintained workflow surface. When deleting scripts, lower `maxMaintainedScriptFiles` to lock in the reduced surface.

The verifier also discovers source package manifests under `apps/*`, `packages/*`, `plugins/*`, and `packages/plugin-sdk/examples/*`. Adding a new package means adding its script surface to `scripts/script-surfaces.json`; otherwise `pnpm run verify:scripts` fails.

## Lifecycle Policy

- `maintained`: part of active project automation. It needs an owner, caller, purpose, and verification command.

Deprecated, candidate, and one-off manual scripts are not supported lifecycle states. Delete them or move the behavior into a documented product or package workflow.

## Current Classification

The current inventory is defined by `scripts/script-manifest.json`; use `pnpm run verify:scripts` for the authoritative count.

- Maintained automation: all current entries are maintained and cover build, contract, dev, release, and test-runner workflows.
- Script test files live under `tests/scripts/`, grouped by script domain and deliberately outside source script directories.
- Agent contract gates live under `tests/scripts/agent/`; AgentRun debugging acceptance internals live under `tests/agent-run-debugging/` instead of extra wrapper scripts. Do not add `scripts/agent/` files; durable agent automation belongs in `apps/agent/scripts/`.
Do not add provider-specific manual connectivity probes to root `scripts/` or package script folders. Use product-level agent/model contract tests or documented provider setup flows instead of keeping unverified SDK hello scripts in the repository.

Do not add `.test.mjs` files under `scripts/`. The script verifier fails if tests are placed there.

Do not add `.mjs`, `.py`, or `.sh` files outside governed script roots unless they live under `tests/`. The script verifier scans the repository and rejects unmanaged script files so ad hoc automation cannot grow beside the manifest.

## Reuse Points

- Use `scripts/release/release-common.mjs` for desktop platform, architecture, release target, FFmpeg binary-name, staged FFmpeg path, checksum, direct-run, URL, license, FFmpeg version-line, FFmpeg metadata, and desktop package verification helpers.
- `pnpm run verify:scripts` rejects release scripts that reimplement helpers owned by `release-common.mjs`.
- Use `scripts/verifier-utils.mjs` for static verifier repository roots, file reads, CLI file-argument parsing, JSON Schema fixture validation, and shared predicate helpers.
- Keep test-only agent contract gates under `tests/scripts/agent/`; keep agent-specific callable scripts under `apps/agent/scripts/`. Do not put AgentRun CLIs, agent contract verifiers, or new `scripts/agent/` files under root `scripts/`.
- Keep app-owned script files explicit in `scripts/script-manifest.json`; unlisted files under governed package script directories fail `pnpm run verify:scripts`.
- Keep plugin SDK examples on `mov.json` plus the shared `movcli build` workflow; do not add `packages/plugin-sdk/examples/*/scripts/` bundlers.
- Keep `apps/movcli` build outputs out of source review. `bundle.js`, `manifest.json`, and `*.movpkg` are generated artifacts covered by repository-level ignore and `.gitattributes` rules.
- Prefer adding a function to one of these shared modules before adding another copy of `--platform`, `--arch`, `sha256`, direct-run, JSON read, text read, schema fixture validation, or file-argument parsing logic.
- Keep desktop packaging behind the release CLI. Use `pnpm run release -- package-desktop --platform=darwin --arch=arm64` instead of adding root `package:desktop` or `package:desktop:*` aliases.
- Keep desktop package preparation folded into `scripts/release/release-workflow.mjs package-desktop`; do not add a separate `prepare-desktop` release script or public subcommand.
- Keep desktop package verification folded into `scripts/release/release-workflow.mjs package-desktop` and shared helpers in `scripts/release/release-common.mjs`; do not add a separate `verify-desktop` release script or public subcommand.
- Keep release subcommands behind `pnpm run release -- <subcommand>` instead of adding `release:*` package aliases. Add public release subcommands to `scripts/script-surfaces.json` `releaseSubcommands`; do not hardcode a second command map in a package script or Makefile target.
- Keep platform-specific Electron packaging behind the `package-desktop` release workflow subcommand; do not add `apps/frontend` `dist:*` aliases for each target.
- Keep backend `package.json` scripts to workspace-level entry points. Fine-grained Go operations such as migrations, tidy, unit tests, and architecture tests stay in `apps/backend/Makefile`.
- Keep all root-level contract coverage behind `test:contracts`; do not add separate root aliases for agent context, AgentRun debugging, or model capability contract gates.
- Keep package-owned model capability coverage behind each package's `test:model-capability-contract`; do not add package-level aliases for individual contract subtests.
- Keep `apps/frontend/movscript-agent/package.json` runtime-only. `apps/frontend/scripts/prepare-agent-deploy.mjs` writes this deployed manifest with `main` and optional `bin`, but without development `scripts`, `testSuites`, or `devDependencies`.

## Manual Scripts

- Root `scripts/manual/` is intentionally unsupported. Delete one-off manual utilities or move durable automation into the owning package's maintained workflow.
- Unlisted files under governed package script directories fail `pnpm run verify:scripts`.
- Generated Python caches such as `scripts/__pycache__` are not source artifacts. The script verifier fails if they appear under `scripts/`.

## Adding or Moving a Script

1. Add the script in the narrowest relevant location. Use `apps/<app>/scripts/` for app-only automation and root `scripts/` only for cross-workspace runners, shared helpers, or release automation.
2. Add or update the manifest entry in sorted path order.
3. Add a package script when the command is a supported workflow.
4. Add a focused verifier or test if the script affects release, generated code, contracts, or user-visible builds.
5. Put script tests under `tests/scripts/`, mirroring the script path when useful.
6. Run `pnpm run verify:scripts` and the relevant subsystem tests before merging.
