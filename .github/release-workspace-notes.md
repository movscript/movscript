# Movscript v0.1.6

## Release Summary

Movscript v0.1.6 is a release housekeeping update for the macOS Apple Silicon and Windows x64 desktop packages. It bumps the release manifests to 0.1.6 and restores the release notes that were missed in v0.1.5.

This release continues to target early community testing of the desktop workflow: project planning, assets, scripts, generation jobs, provider configuration, assistant workflows, and rough-cut production flows.

## Highlights

- Bump the Movscript release manifests from 0.1.5 to 0.1.6.
- Backfill the missing v0.1.5 changelog and release-note coverage.
- Carry forward the v0.1.5 desktop runtime improvements:
  - Allow `file://` origins in backend CORS handling for local desktop runtime flows.
  - Handle MCP server requests with explicit request ids in the Electron SDK runtime client.
- Publish macOS Apple Silicon / arm64 and Windows x64 desktop packages.
- Bundle only the Mova app-server runtime package for the desktop app-server path.

## Packaging And Verification

- Release readiness check is expected to validate tag `v0.1.6` against package version `0.1.6`.
- Package resource contract verification runs as part of the release workflow.
- The macOS and Windows packaged app smoke tests run as part of the release workflow.
- DMG checksum verification, mounted app verification, and Windows package verification run as part of the release workflow.
- SHA256 checksums are attached with the release artifacts.

## Known Issues

- Only macOS Apple Silicon / arm64 and Windows x64 are published in this release. Intel Mac and Linux packages are not included yet.
- The app is still an early community release. Workflows, file formats, provider behavior, plugin contracts, and release packaging may change before a stable version.
- If this build is distributed without Apple Developer ID signing and notarization, macOS Gatekeeper may require manual approval before the app can be opened.
- Some frontend bundles are currently large; startup and first-load performance may be tuned in later releases.

## Checks

- Release readiness verified by GitHub Actions
- Package resources verified by GitHub Actions
- Desktop smoke test verified by GitHub Actions
- SHA256 checksums attached by GitHub Actions
