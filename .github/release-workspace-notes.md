# Movscript v0.1.1

## Release Summary

Movscript v0.1.1 is the first desktop release candidate focused on the macOS Apple Silicon app package. It packages the local-first Movscript desktop workspace with the backend service, admin console, provider plugin bundle, SDK runtime seed, and ffmpeg runtime resources.

This release is intended for early community testing of the desktop workflow: project planning, assets, scripts, generation jobs, provider configuration, assistant workflows, and rough-cut production flows.

## Highlights

- Publish a macOS Apple Silicon / arm64 desktop DMG.
- Bundle the local backend service into the desktop app so Movscript can run as a local-first workspace.
- Bundle admin assets, the Movscript provider plugin, movcli resources, SDK runtime seed packages, and ffmpeg resources into the desktop package.
- Improve local backend startup diagnostics with a backend log path and recent backend output surfaced in the desktop boot screen.
- Hide the internal local provider adapter from the admin provider picker.
- Refresh the README and Chinese README around the current community edition scope, downloads, Docker setup, and early-release status.
- Tighten release packaging checks for package resources, ffmpeg metadata, packaged app smoke testing, DMG checksum verification, and mounted app verification.

## Packaging And Verification

- Release readiness check passed for `v0.1.1`.
- Package resource contract verification passed.
- macOS packaged app smoke test passed.
- DMG checksum verification passed.
- Mounted DMG app code signature verification passed.
- Mounted DMG app icon verification passed.
- SHA256 checksums are attached with the release artifacts.

## Known Issues

- Only macOS Apple Silicon / arm64 is published in this release. Intel Mac, Windows, and Linux packages are not included yet.
- The app is still an early community release. Workflows, file formats, provider behavior, plugin contracts, and release packaging may change before a stable version.
- If this build is distributed without Apple Developer ID signing and notarization, macOS Gatekeeper may require manual approval before the app can be opened.
- Some frontend bundles are currently large; startup and first-load performance may be tuned in later releases.

## Checks

- Release readiness verified
- Package resources verified
- Desktop smoke test passed
- SHA256 checksums attached
