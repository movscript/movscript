# Changelog

All notable changes to this project will be documented in this file.

This project follows semantic versioning once stable releases begin.

## Unreleased

## 0.1.42 - 2026-07-06

### Added

- Added Agent Plugin package metadata for provider-native registration and installer handoff.
- Added Desktop bundled provider plugin installation coverage for Home current/previous runtime behavior.

### Changed

- Bumped release package manifests to 0.1.42.
- Improved plugin distribution metadata version alignment across Agent Plugin, Codex plugin, provider plugin, and runtime bundle manifests.

## 0.1.41 - 2026-07-05

### Added

- Enhanced MovScript resource upload support for agent-accessible image, video, audio, and text artifacts.
- Added backend launch policy and SDK runtime client test coverage.

### Changed

- Bumped release package manifests to 0.1.41.

## 0.1.40 - 2026-07-04

### Added

- Added admin overview navigation and metrics for the desktop admin surface.
- Expanded local daemon, app-server, and agent runtime tooling.
- Added adapter coverage and registry updates for newer generation providers.

### Changed

- Refactored the desktop shell and runtime integration paths.
- Improved route endpoint configuration and effective URL handling.
- Refined project picker and project home surfaces.
- Bumped release package manifests to 0.1.40.

### Packaging

- Kept the GitHub Actions release flow publishing Agent Plugin plus macOS, Windows, and Linux Desktop artifacts.
- Continued release readiness, package resource, desktop smoke, plugin smoke, and checksum verification in CI.

## 0.1.7 - 2026-06-21

### Changed

- Bumped release package manifests to 0.1.7.
- Updated the desktop release workflow to publish the macOS Apple Silicon package.
- Replaced the bundled full Mova package with platform-specific Mova app-server runtime packages for the desktop app-server path.

## 0.1.6 - 2026-06-20

### Changed

- Bumped release package manifests to 0.1.6.
- Refreshed GitHub release notes and backfilled the missing 0.1.5 changelog entry.

## 0.1.5 - 2026-06-20

### Added

- Initial open-source project documentation and governance files.
- GitHub Actions CI for backend tests and frontend typecheck/build.
- Frontend internationalization foundation with English and Simplified Chinese locale files.
- Environment examples for backend and frontend configuration.
- Documentation indexes for the public `docs/` guides and planning documents.
- Backend CORS support for `file://` origins used by local desktop runtime flows.
- Electron SDK runtime client handling for MCP server requests with explicit request ids.

### Changed

- Reorganized release-facing documentation around open-source project conventions.
- Updated API, configuration, plugin, agent, model-gateway, and security docs to match current code behavior.
- Bumped release package manifests to 0.1.5.
