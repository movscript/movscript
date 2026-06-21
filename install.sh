#!/bin/sh
set -eu

REPO="${MOVSCRIPT_GITHUB_REPO:-movscript/movscript}"
RELEASE="${MOVSCRIPT_RELEASE:-latest}"
INSTALL_DIR="${MOVSCRIPT_INSTALL_DIR:-/Applications}"
APP_NAME="${MOVSCRIPT_APP_NAME:-Movscript.app}"
ASSET="${MOVSCRIPT_ASSET:-}"
ASSET_PREFIX="${MOVSCRIPT_ASSET_PREFIX:-}"
CHECKSUM_ASSET="${MOVSCRIPT_CHECKSUM_ASSET:-SHA256SUMS.txt}"
VERIFY_CHECKSUM=1
FORCE=0
DRY_RUN=0
OPEN_APP=0

usage() {
  cat <<'EOF'
Install Movscript Desktop from GitHub Releases.

Usage:
  sh install.sh [options]

Options:
  --release <tag|latest>     Release tag to install. Defaults to latest.
  --repo <owner/repo>        GitHub repository. Defaults to movscript/movscript.
  --install-dir <path>       App install directory. Defaults to /Applications.
  --asset <filename>         Release asset filename. Defaults to auto-detect.
  --asset-prefix <prefix>    Asset prefix used for auto-detect.
  --force                    Replace an existing Movscript.app.
  --open                     Open Movscript after installation.
  --no-verify                Skip SHA256SUMS.txt verification.
  --dry-run                  Print actions without downloading or installing.
  -h, --help                 Show this help.

Environment overrides:
  MOVSCRIPT_GITHUB_REPO, MOVSCRIPT_RELEASE, MOVSCRIPT_INSTALL_DIR,
  MOVSCRIPT_APP_NAME, MOVSCRIPT_ASSET, MOVSCRIPT_ASSET_PREFIX,
  MOVSCRIPT_CHECKSUM_ASSET.
EOF
}

log() {
  printf '%s\n' "movscript-install: $*"
}

fail() {
  printf '%s\n' "movscript-install: error: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '%s\n' "+ $*"
  else
    "$@"
  fi
}

url_for_asset() {
  asset_name=$1
  if [ "$RELEASE" = "latest" ]; then
    printf 'https://github.com/%s/releases/latest/download/%s\n' "$REPO" "$asset_name"
  else
    printf 'https://github.com/%s/releases/download/%s/%s\n' "$REPO" "$RELEASE" "$asset_name"
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --release)
      [ "$#" -ge 2 ] || fail "--release requires a value"
      RELEASE=$2
      shift 2
      ;;
    --repo)
      [ "$#" -ge 2 ] || fail "--repo requires a value"
      REPO=$2
      shift 2
      ;;
    --install-dir)
      [ "$#" -ge 2 ] || fail "--install-dir requires a value"
      INSTALL_DIR=$2
      shift 2
      ;;
    --asset)
      [ "$#" -ge 2 ] || fail "--asset requires a value"
      ASSET=$2
      shift 2
      ;;
    --asset-prefix)
      [ "$#" -ge 2 ] || fail "--asset-prefix requires a value"
      ASSET_PREFIX=$2
      shift 2
      ;;
    --force)
      FORCE=1
      shift
      ;;
    --open)
      OPEN_APP=1
      shift
      ;;
    --no-verify)
      VERIFY_CHECKSUM=0
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown option: $1"
      ;;
  esac
done

[ "$(uname -s)" = "Darwin" ] || fail "only macOS is supported by this installer right now"
MACHINE_ARCH=$(uname -m)
case "$MACHINE_ARCH" in
  arm64) DEFAULT_ASSET_PREFIX="movscript-desktop-macos-arm64-Movscript" ;;
  x86_64) DEFAULT_ASSET_PREFIX="movscript-desktop-macos-x64-Movscript" ;;
  *) fail "unsupported macOS architecture: $MACHINE_ARCH" ;;
esac

if [ -z "$ASSET_PREFIX" ]; then
  ASSET_PREFIX=$DEFAULT_ASSET_PREFIX
fi

case "$REPO" in
  */*) ;;
  *) fail "--repo must be in owner/repo form" ;;
esac

if [ -n "$ASSET" ]; then
  case "$ASSET" in
    *.dmg) ;;
    *) fail "this installer currently supports .dmg assets only: $ASSET" ;;
  esac
fi

require_command curl
require_command hdiutil
require_command shasum
require_command awk
require_command find
require_command ditto

CHECKSUM_URL=$(url_for_asset "$CHECKSUM_ASSET")
TARGET_APP="$INSTALL_DIR/$APP_NAME"

log "repository: $REPO"
log "release: $RELEASE"
if [ -n "$ASSET" ]; then
  log "asset: $ASSET"
else
  log "asset: auto-detect ${ASSET_PREFIX}*.dmg"
fi
log "install target: $TARGET_APP"

if [ "$DRY_RUN" -eq 1 ]; then
  log "checksum URL: $CHECKSUM_URL"
  if [ -n "$ASSET" ]; then
    log "download URL: $(url_for_asset "$ASSET")"
  else
    log "download URL: resolved from $CHECKSUM_ASSET"
  fi
  log "dry run complete"
  exit 0
fi

if [ -e "$TARGET_APP" ] && [ "$FORCE" -ne 1 ]; then
  fail "$TARGET_APP already exists; rerun with --force to replace it"
fi

if [ ! -d "$INSTALL_DIR" ]; then
  if mkdir -p "$INSTALL_DIR" 2>/dev/null; then
    :
  else
    log "$INSTALL_DIR cannot be created without elevated permissions; sudo may ask for your password"
    sudo mkdir -p "$INSTALL_DIR"
  fi
fi

TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/movscript-install.XXXXXX")
MOUNT_DIR="$TMP_DIR/mount"
SUMS_PATH="$TMP_DIR/$CHECKSUM_ASSET"
MOUNTED=0

cleanup() {
  if [ "$MOUNTED" -eq 1 ]; then
    hdiutil detach "$MOUNT_DIR" -quiet >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

if [ "$VERIFY_CHECKSUM" -eq 1 ] || [ -z "$ASSET" ]; then
  log "downloading checksums"
  curl -fL --retry 3 --connect-timeout 20 --output "$SUMS_PATH" "$CHECKSUM_URL"
fi

if [ -z "$ASSET" ]; then
  ASSET=$(awk -v prefix="$ASSET_PREFIX" '
    {
      path = $2
      count = split(path, parts, "/")
      name = parts[count]
      if (index(name, prefix) == 1 && name ~ /\.dmg$/) {
        print name
        exit
      }
    }
  ' "$SUMS_PATH")
  [ -n "$ASSET" ] || fail "could not find a ${ASSET_PREFIX}*.dmg entry in $CHECKSUM_ASSET"
  log "resolved asset: $ASSET"
fi

ASSET_URL=$(url_for_asset "$ASSET")
DMG_PATH="$TMP_DIR/$ASSET"

if [ "$VERIFY_CHECKSUM" -eq 1 ]; then
  EXPECTED_SHA=$(awk -v asset="$ASSET" '
    $2 == asset { print $1; exit }
    $2 ~ "/" asset "$" { print $1; exit }
  ' "$SUMS_PATH")
  [ -n "$EXPECTED_SHA" ] || fail "checksum for $ASSET was not found in $CHECKSUM_ASSET"
fi

log "downloading desktop package"
curl -fL --retry 3 --connect-timeout 20 --output "$DMG_PATH" "$ASSET_URL"

if [ "$VERIFY_CHECKSUM" -eq 1 ]; then
  ACTUAL_SHA=$(shasum -a 256 "$DMG_PATH" | awk '{ print $1 }')
  [ "$EXPECTED_SHA" = "$ACTUAL_SHA" ] || fail "checksum mismatch for $ASSET"
  log "checksum verified"
else
  log "checksum verification skipped"
fi

mkdir -p "$MOUNT_DIR"
log "mounting package"
hdiutil attach "$DMG_PATH" -nobrowse -readonly -quiet -mountpoint "$MOUNT_DIR"
MOUNTED=1

SOURCE_APP=$(find "$MOUNT_DIR" -maxdepth 2 -name "$APP_NAME" -type d -print -quit)
[ -n "$SOURCE_APP" ] || fail "$APP_NAME was not found inside $ASSET"

if [ -e "$TARGET_APP" ]; then
  log "removing existing app"
  if [ -w "$INSTALL_DIR" ]; then
    run rm -rf "$TARGET_APP"
  else
    log "$INSTALL_DIR is not writable; sudo may ask for your password"
    run sudo rm -rf "$TARGET_APP"
  fi
fi

log "copying app to $INSTALL_DIR"
if [ -w "$INSTALL_DIR" ]; then
  run ditto "$SOURCE_APP" "$TARGET_APP"
else
  log "$INSTALL_DIR is not writable; sudo may ask for your password"
  run sudo ditto "$SOURCE_APP" "$TARGET_APP"
fi

log "installed $TARGET_APP"

if [ "$OPEN_APP" -eq 1 ]; then
  log "opening Movscript"
  run open "$TARGET_APP"
else
  log "open Movscript from Applications when you are ready"
fi
