# Movscript Agent Plugin And Desktop

## Release Summary

Movscript 0.1.40 publishes two user-facing packages from the same GitHub Release:

- Movscript Agent Plugin, a plugin-only `movscript-agent-plugin` package for Codex or another Agent provider without installing Desktop.
- Movscript Desktop, the local visual workspace for macOS Apple Silicon, macOS Intel, Windows x64, and Linux x64.

Both packages reuse the same local `movscript.local-node` daemon when local execution is needed. The daemon is a shared runtime component, not a third public download choice.

## Highlights

- Refactor the desktop shell and runtime integration path.
- Expand local daemon, app-server, and agent runtime tooling.
- Add an admin overview surface with operational metrics and navigation links.
- Improve route endpoint configuration and effective URL handling.
- Expand runtime tooling for project, agent, and generation workflows.
- Add and test newer provider adapter coverage, including Vyro Seedance and Xiaomi MiMo related paths.
- Improve project picker and project home surface structure.
- Continue publishing the Agent Plugin package separately from Desktop.
- Continue publishing macOS Apple Silicon, macOS Intel, Windows x64, and Linux x64 Desktop artifacts.
- Publish the Linux x64 Desktop package as an AppImage artifact.
- Continue attaching SHA256 checksums for release assets.

## Packaging And Verification

- Release readiness checks validate the tag against the package version.
- Package resource contract verification runs as part of the release workflow.
- The Agent Plugin package is built, smoke tested, and attached as a separate release artifact.
- Desktop packages are built and smoke tested on macOS, Windows, and Linux runners.
- DMG checksum verification and mounted app verification run as part of the macOS release workflow.
- Build provenance attestations are generated for release artifacts.

## Known Issues

- Windows ARM64 packages are temporarily omitted until a stable ffmpeg source is available.
- Windows packages may be unsigned unless release signing is configured; Windows SmartScreen can require manual approval for unsigned builds.
- The app is still an early community release. Workflows, file formats, provider behavior, plugin contracts, and release packaging may change before a stable version.
- If this build is distributed without Apple Developer ID signing and notarization, macOS Gatekeeper may require manual approval before the app can be opened.
- Some frontend bundles are currently large; startup and first-load performance may be tuned in later releases.

## Checks

- Release readiness verified by GitHub Actions
- Package resources verified by GitHub Actions
- Agent Plugin smoke test verified by GitHub Actions
- Desktop smoke test verified by GitHub Actions
- SHA256 checksums attached by GitHub Actions
