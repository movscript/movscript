# Repository Guidelines

## Project Structure & Module Organization

MovScript is a pnpm monorepo. Desktop code lives in `apps/desktop`, with Electron services under `apps/desktop/electron` and React UI under `apps/desktop/src`. Shared domain, runtime, workspace, UI, and media packages live in `packages/*`. Web surfaces are in `surface/*`, backend services in `services/*`, and automation or release utilities in `scripts/` and `tools/`. Static and design assets are kept in `assets/`, `design-preview/`, and feature-specific package folders.

## Build, Test, and Development Commands

- `pnpm install`: install workspace dependencies.
- `pnpm run build`: build all workspace packages and sync plugin distribution files.
- `pnpm run typecheck`: run TypeScript checks across packages.
- `pnpm run test`: run package tests plus desktop tests.
- `pnpm --filter @movscript/desktop dev`: start the desktop app development workflow.
- `pnpm --filter @movscript/desktop typecheck`: check desktop renderer and Electron TypeScript.
- `pnpm --filter @movscript/desktop test`: run desktop node tests.
- `pnpm run check`: full validation pipeline; use before release-sized changes.

## Coding Style & Naming Conventions

Use TypeScript and ESM-style imports. Follow the existing module boundaries: UI components stay close to their feature, Electron-only code stays in `apps/desktop/electron`, and reusable logic belongs in `packages/*`. Prefer descriptive camelCase for functions and variables, PascalCase for React components and types, and kebab-case or scoped package names for package directories. Keep changes narrowly scoped and avoid generated or distribution files unless the command explicitly updates them.

## Testing Guidelines

Tests use Node's test runner and package-specific scripts. Name tests `*.test.ts`, `*.test.tsx`, or `*.test.mjs` near the code they cover. For desktop changes, run focused tests with `pnpm --filter @movscript/desktop exec tsx path/to/file.test.ts`, then run `pnpm --filter @movscript/desktop typecheck`.

## Commit & Pull Request Guidelines

Git history mixes Conventional Commits like `feat(admin): ...` with concise imperative summaries. Prefer `feat(scope):`, `fix(scope):`, or a clear action phrase. PRs should include a short problem statement, implementation summary, test results, linked issues when relevant, and screenshots or recordings for UI changes.

## Security & Configuration Tips

Do not commit local secrets, `.movscript-dev` state, release artifacts, or generated credentials. Keep environment-specific behavior behind existing config helpers and document any new required variables.
