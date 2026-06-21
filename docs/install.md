# Installing Movscript

Movscript Desktop is distributed from GitHub Releases. The installer does not
require a Movscript-hosted server; `movscript.github.io/movscript/install.sh`
is served by GitHub Pages and the desktop package is downloaded from the
release assets.

## User Install

```bash
curl -fsSL https://movscript.github.io/movscript/install.sh | sh
```

The shell installer supports macOS Apple Silicon / arm64 and installs the
latest `movscript-desktop-macos-arm64-Movscript.dmg` release asset to
`/Applications/Movscript.app`.

Windows x64 users should download the Windows installer from GitHub Releases.
The release asset is prefixed with `movscript-desktop-windows-x64-` and ends in
`.exe`. The installer lets users choose the program installation directory.

## Options

```bash
sh install.sh --help
sh install.sh --dry-run
sh install.sh --release v0.1.11
sh install.sh --force
sh install.sh --install-dir "$HOME/Applications"
```

The installer downloads `SHA256SUMS.txt` from the same GitHub Release and
verifies the selected `.dmg` before mounting it. Use `--no-verify` only for
temporary local testing.

## Release Asset Contract

The macOS shell installer expects these release assets:

- `movscript-desktop-macos-arm64-Movscript.dmg`
- `SHA256SUMS.txt`

The existing release workflow collects desktop artifacts with the matrix prefix
`movscript-desktop-macos-arm64` and creates a combined `SHA256SUMS.txt` before
uploading the GitHub Release assets.

The Windows release job publishes installer and portable artifacts with the
matrix prefix `movscript-desktop-windows-x64`. Windows installation location and
Movscript Home are intentionally separate: the installer controls where the app
binaries live, while Movscript Home controls user data, cache, runtime state,
and generated files. By default Windows uses `%LOCALAPPDATA%\Movscript\Home`;
users can move it to a larger drive such as `D:\MovscriptHome` from the desktop
settings page.

## Publishing the GitHub Pages Installer

No server is required.

1. Enable GitHub Pages for this repository and select GitHub Actions as the
   Pages source.
2. The `Deploy Installer Page` workflow publishes `site/`, the root
   `install.sh`, and the project logo to the GitHub Pages artifact.
3. Users can run the shell installer from
   `https://movscript.github.io/movscript/install.sh`.
