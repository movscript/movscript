# Movscript v0.1.7

## Release Summary

Movscript v0.1.7 updates the desktop release packaging to ship the macOS Apple Silicon build with the Mova app-server runtime bundle.

This release continues to target early community testing of the desktop workflow: project planning, assets, scripts, generation jobs, provider configuration, assistant workflows, and rough-cut production flows.

## Highlights

- Bump the Movscript release manifests from 0.1.6 to 0.1.7.
- Publish the macOS Apple Silicon / arm64 desktop package.
- Bundle only the Mova app-server runtime package for the desktop app-server path instead of the full Mova package.
- Resolve bundled app-server binaries from the platform-specific `@movscript/mova-app-server-*` packages.

## Packaging And Verification

- Release readiness check is expected to validate tag `v0.1.7` against package version `0.1.7`.
- Package resource contract verification runs as part of the release workflow.
- The macOS packaged app smoke test runs as part of the release workflow.
- DMG checksum verification and mounted app verification run as part of the release workflow.
- SHA256 checksums are attached with the release artifacts.

## Known Issues

- Only macOS Apple Silicon / arm64 is published in this release. Windows, Intel Mac, and Linux packages are not included yet.
- Windows desktop packaging is not yet part of the stable release matrix; Windows paths, runtime home handling, bundled tools, and package verification need a dedicated compatibility pass before publishing.
- The app is still an early community release. Workflows, file formats, provider behavior, plugin contracts, and release packaging may change before a stable version.
- If this build is distributed without Apple Developer ID signing and notarization, macOS Gatekeeper may require manual approval before the app can be opened.
- Some frontend bundles are currently large; startup and first-load performance may be tuned in later releases.

## Checks

- Release readiness verified by GitHub Actions
- Package resources verified by GitHub Actions
- Desktop smoke test verified by GitHub Actions
- SHA256 checksums attached by GitHub Actions
