# Movscript Desktop

## Release Summary

This release packages Movscript Desktop for macOS Apple Silicon and Windows x64 with the bundled Mova app-server runtime.

This release continues to target early community testing of the desktop workflow: project planning, assets, scripts, generation jobs, provider configuration, assistant workflows, and rough-cut production flows.

## Highlights

- Publish the macOS Apple Silicon / arm64 desktop package.
- Publish the Windows x64 desktop package as an installer and portable artifact.
- Bundle only the Mova app-server runtime package for the desktop app-server path instead of the full Mova package.
- Resolve bundled app-server binaries from the platform-specific `@movscript/mova-app-server-*` packages.
- Use a Windows-specific Movscript Home default under `%LOCALAPPDATA%\Movscript\Home`, with a settings-page directory picker for moving data to a larger drive.

## Packaging And Verification

- Release readiness check validates the tag against the package version.
- Package resource contract verification runs as part of the release workflow.
- The macOS and Windows packaged app smoke tests run as part of the release workflow.
- DMG checksum verification and mounted app verification run as part of the release workflow.
- SHA256 checksums are attached with the release artifacts.

## Known Issues

- Intel Mac, Linux, and Windows arm64 packages are not included yet.
- Windows packages may be unsigned unless release signing is configured; Windows SmartScreen can require manual approval for unsigned builds.
- The app is still an early community release. Workflows, file formats, provider behavior, plugin contracts, and release packaging may change before a stable version.
- If this build is distributed without Apple Developer ID signing and notarization, macOS Gatekeeper may require manual approval before the app can be opened.
- Some frontend bundles are currently large; startup and first-load performance may be tuned in later releases.

## Checks

- Release readiness verified by GitHub Actions
- Package resources verified by GitHub Actions
- Desktop smoke test verified by GitHub Actions
- SHA256 checksums attached by GitHub Actions
