# Installing Movscript

Movscript Desktop is distributed from GitHub Releases. The installer does not
require a Movscript-hosted server; `movscript.com/install.sh` can be served by
GitHub Pages and the desktop package is downloaded from the release assets.

## User Install

```bash
curl -fsSL https://movscript.com/install.sh | sh
```

Until the custom domain is live, the same script can be run from GitHub:

```bash
curl -fsSL https://raw.githubusercontent.com/movscript/movscript/main/install.sh | sh
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
sh install.sh --release v0.1.9
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

## Publishing `movscript.com/install.sh`

No server is required.

1. Enable GitHub Pages for this repository and select GitHub Actions as the
   Pages source.
2. Point the `movscript.com` DNS records to GitHub Pages.
3. Add the domain in the repository Pages settings so GitHub creates the Pages
   custom-domain binding.
4. The `Deploy Installer Page` workflow publishes the root `install.sh` as
   `/install.sh` and writes the `CNAME` file when `MOVSCRIPT_PAGES_DOMAIN` is
   configured as a repository variable.

If the repository variable is not set, the workflow still publishes the script
on the default GitHub Pages domain.
