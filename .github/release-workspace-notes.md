# Movscript Desktop

## Release Summary

This release packages Movscript Desktop for macOS Apple Silicon, macOS Intel, and Windows x64 with on-demand Agent runtime downloads.

This release continues to target early community testing of the desktop workflow: project planning, assets, scripts, generation jobs, provider configuration, assistant workflows, and rough-cut production flows.

## Highlights

- Publish the macOS Apple Silicon / arm64 desktop package.
- Publish the macOS Intel / x64 desktop package.
- Publish the Windows x64 desktop package as an installer and portable artifact.
- Stop bundling the app-server runtime by default; Mova and Codex app-server agents now become available only after the runtime is installed.
- Install the app-server runtime on demand from the `@movscript/mova-app-server` meta package, which resolves the matching platform package.
- Prevent ordinary runtime requests from auto-installing app-server packages; only the Console download/update action and tray runtime actions can use the install channel.
- Add tray status and nested download, update, and uninstall actions for the built-in Mova, Codex, and Claude Code agent runtimes.
- Reuse the same React runtime operation dialog for Console downloads and tray runtime tasks, including simultaneous multi-agent download status.
- Remember local projects opened, fetched, or initialized through MovScript MCP project tools in the desktop recent projects list.
- Bind project-scoped MCP tools and desktop project views to explicit local project directories, with user-scoped project data decisions when no org scope is present.
- Build the macOS Intel / x64 package on the macOS 14 runner to avoid stalled macOS 13 Intel runner allocation.
- Ad-hoc sign unsigned macOS preview packages before creating DMGs so downloaded apps have a valid bundle signature.
- Preserve the macOS Electron entitlements required for ad-hoc signed preview builds so Electron Framework can load at launch.
- Recommend the matching desktop download on GitHub Pages based on the visitor's OS and architecture when browser detection is available.
- Use a Windows-specific Movscript Home default under `%LOCALAPPDATA%\Movscript\Home`, with a settings-page directory picker for moving data to a larger drive.
- Persist SDK runtime thread snapshots and provider resume tokens in MovScript Home so Claude SDK conversations restore their visible history after desktop restarts.

## Packaging And Verification

- Release readiness check validates the tag against the package version.
- Package resource contract verification runs as part of the release workflow.
- The macOS and Windows packaged app smoke tests run as part of the release workflow.
- DMG checksum verification and mounted app verification run as part of the release workflow.
- SHA256 checksums are attached with the release artifacts.

## Known Issues

- Linux desktop packages are not included yet.
- Windows ARM64 packages are temporarily omitted until a stable ffmpeg source is available.
- Windows packages may be unsigned unless release signing is configured; Windows SmartScreen can require manual approval for unsigned builds.
- The app is still an early community release. Workflows, file formats, provider behavior, plugin contracts, and release packaging may change before a stable version.
- If this build is distributed without Apple Developer ID signing and notarization, macOS Gatekeeper may require manual approval before the app can be opened.
- Some frontend bundles are currently large; startup and first-load performance may be tuned in later releases.

## Checks

- Release readiness verified by GitHub Actions
- Package resources verified by GitHub Actions
- Desktop smoke test verified by GitHub Actions
- SHA256 checksums attached by GitHub Actions
