Place platform ffmpeg binaries here when building desktop packages.

Expected layout:

- `darwin/arm64/ffmpeg`
- `darwin/arm64/METADATA.json`
- `darwin/x64/ffmpeg`
- `darwin/x64/METADATA.json`
- `linux/x64/ffmpeg`
- `linux/x64/METADATA.json`
- `linux/arm64/ffmpeg`
- `linux/arm64/METADATA.json`
- `win32/x64/ffmpeg.exe`
- `win32/x64/METADATA.json`
- `win32/arm64/ffmpeg.exe`
- `win32/arm64/METADATA.json`

Development builds also use `FFMPEG_PATH`, `MOVSCRIPT_FFMPEG_PATH`, or `ffmpeg`
from `PATH`.

Release verification requires the binary for the current build platform to exist
and successfully run `-version`. On macOS and Linux, make the binary executable:

```sh
chmod +x apps/frontend/vendor/ffmpeg/darwin/arm64/ffmpeg
chmod +x apps/frontend/vendor/ffmpeg/linux/x64/ffmpeg
```

To stage a vetted redistributable binary from a release machine:

```sh
MOVSCRIPT_FFMPEG_BIN=/path/to/ffmpeg \
MOVSCRIPT_FFMPEG_SOURCE_URL=$ACTUAL_FFMPEG_RELEASE_URL \
MOVSCRIPT_FFMPEG_LICENSE=LGPL-2.1-or-later \
pnpm run release:stage-ffmpeg
```

Set `ACTUAL_FFMPEG_RELEASE_URL` to the real upstream release page or artifact URL
before running the command.

To stage a binary for a platform or architecture other than the current release
machine:

```sh
MOVSCRIPT_FFMPEG_BIN=/path/to/ffmpeg.exe \
MOVSCRIPT_FFMPEG_SOURCE_URL=$ACTUAL_FFMPEG_RELEASE_URL \
MOVSCRIPT_FFMPEG_LICENSE=LGPL-2.1-or-later \
MOVSCRIPT_FFMPEG_VERSION='ffmpeg version n6.1.1-static' \
pnpm run release:stage-ffmpeg -- --platform=win32 --arch=x64
```

`MOVSCRIPT_FFMPEG_PLATFORM=darwin|linux|win32` can also be used when a CI system
prefers environment variables over CLI flags. Use `MOVSCRIPT_FFMPEG_ARCH=x64|arm64`
or `--arch=x64|arm64` to match the desktop package target.

When staging for the current platform, the script runs `ffmpeg -version` before
and after copying the binary. When staging for another platform or architecture,
the binary cannot be executed reliably, so `MOVSCRIPT_FFMPEG_VERSION` must be set
to the first line from that target binary's `ffmpeg -version` output.

The staging script also writes `METADATA.json` next to the binary with the
target architecture, binary name, staged timestamp, source basename, source URL,
license identifier, SHA-256 digest, byte size, and the first `ffmpeg -version`
line. Keep that file with the binary so desktop release audits can trace what
was packaged and detect binary/metadata mismatches.

The staging script refuses common package-manager and system install locations
such as Homebrew, MacPorts, Linuxbrew, apt/dnf system paths, Nix, snap,
Chocolatey, Scoop, and winget. Use an explicitly redistributable release artifact
instead of pointing staging at a locally installed `ffmpeg`.
It also rejects `example.com`, `example.org`, and `example.net` source URLs so
placeholder metadata cannot accidentally ship.

To audit the current platform binary and metadata before packaging:

```sh
pnpm run release:audit-ffmpeg
```

For a full cross-platform staging audit, use:

```sh
pnpm run release:audit-ffmpeg:all
```

For a full platform and architecture matrix audit, use:

```sh
pnpm run release:audit-ffmpeg:matrix
```

The audit validates metadata hash/size/license/source details and runs
`-version` for the current build platform. Pass `-- --arch=x64|arm64` when
auditing a staged binary for a non-current target architecture.

After packaging, `pnpm run release:verify-desktop` also checks the unpacked
Electron app resources. It requires `resources/ffmpeg/<platform>/<arch>/<binary>`
to be present in the packaged app, validates the packaged metadata, and compares
the packaged binary hash with the staged source binary. Platform-specific
packaging scripts pass the target architecture through to verification.

Use an SPDX-style license expression for `MOVSCRIPT_FFMPEG_LICENSE`, such as
`LGPL-2.1-or-later` or `LGPL-2.1-or-later OR GPL-3.0-or-later`.

The verifier only guarantees that the staged and packaged files are consistent
and runnable on the build machine. Release owners are still responsible for
using a binary that is licensed and redistributable for the target platform.
