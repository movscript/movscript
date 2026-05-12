# Release Process

Movscript releases are built from tags and published as GitHub draft releases. The release pipeline is intentionally conservative: CI builds unsigned desktop packages, uploads checksums, and leaves the release as a draft for manual smoke testing.

## Local Checks

Run the release gate before cutting a tag:

```bash
pnpm install --frozen-lockfile
pnpm run release:check
```

For a local desktop package on the current platform:

```bash
pnpm run package:desktop
pnpm run release:collect
```

The collected files are written to `release-artifacts/` with `SHA256SUMS.txt`.

## Tag Release

Use semver-style tags:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The `Release` workflow creates or updates a draft GitHub Release for the tag, builds macOS and Windows artifacts, and uploads the package files plus checksums.

## Manual Smoke Test

Before publishing the draft release:

- Install or open each platform artifact.
- Confirm the desktop app starts.
- Confirm the embedded backend starts in local mode.
- Confirm the admin bundle is present.
- Confirm the local agent runtime starts or reports a clear error.
- Create a small project and open the main workspace.

## Signing Roadmap

The first release workflow sets `CSC_IDENTITY_AUTO_DISCOVERY=false`, so electron-builder does not depend on local signing identities. Production distribution should add:

- macOS Developer ID certificate.
- Apple notarization credentials.
- Windows code-signing certificate.
- Per-platform CI secrets and signing verification.

Keep releases as drafts until signed packages have been smoke tested.
