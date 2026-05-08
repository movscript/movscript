# Release Checklist

[简体中文](release-checklist.zh-CN.md)

Use this checklist before publishing a GitHub release or announcing a public milestone.

## Version and Changelog

- Confirm the version in `package.json` and package-specific manifests.
- Update `CHANGELOG.md` with user-facing changes, migration notes, and known limitations.
- Mark unstable APIs, plugin contracts, and agent contracts clearly.

## Licensing and Governance

- Confirm `LICENSE`, `LICENSE_SCOPE.md`, and README license text agree.
- Confirm contribution, security, and code-of-conduct files are linked from README.
- Check whether any vendored or bundled third-party files require additional notices.

## Documentation

- Check README quick start from a clean checkout.
- Check `README.md` and `README.zh-CN.md` language links.
- Check `docs/README.md` and `docs/README.zh-CN.md` indexes.
- Verify local Markdown links.
- Recheck data and privacy guidance when storage, provider calls, logs, or agent memory behavior changes.
- Update screenshots or demos if the UI changed materially.

## Security

- Ensure no `.env`, provider key, local database, object-storage data, generated binary, or private credential is committed.
- Use unique `ENCRYPTION_KEY` and `AUTH_TOKEN_SECRET` values in every deployed environment.
- Keep PostgreSQL, Redis, MinIO, and local agent endpoints off the public internet unless explicitly protected.
- Rotate provider keys if logs, backups, or development files were exposed.

## Build and Test

Run the broad checks:

```bash
make test
make build
```

For desktop packages:

```bash
pnpm run package:desktop
```

Use platform-specific packaging commands when preparing platform artifacts:

```bash
pnpm run package:desktop:mac
pnpm run package:desktop:win
pnpm run package:desktop:win:arm64
```

## GitHub Release

- Tag the release from the intended commit.
- Attach platform artifacts only after local smoke tests.
- Include install notes, upgrade notes, known issues, and compatibility warnings.
- Link back to the documentation index and changelog.
