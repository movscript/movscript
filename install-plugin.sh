#!/bin/sh
set -eu

REPO="${MOVSCRIPT_GITHUB_REPO:-movscript/movscript}"
RELEASE="${MOVSCRIPT_RELEASE:-latest}"
MOVSCRIPT_HOME="${MOVSCRIPT_HOME:-$HOME/.movscript}"
ASSET="${MOVSCRIPT_PLUGIN_ASSET:-}"
ASSET_PREFIX="${MOVSCRIPT_PLUGIN_ASSET_PREFIX:-movscript-agent-plugin-}"
CHECKSUM_ASSET="${MOVSCRIPT_CHECKSUM_ASSET:-SHA256SUMS.txt}"
PROVIDER="${MOVSCRIPT_AGENT_PROVIDER:-codex}"
LOCAL_ZIP="${MOVSCRIPT_PLUGIN_LOCAL_ZIP:-}"
VERIFY_CHECKSUM=1
DRY_RUN=0

usage() {
  cat <<'EOF'
Install the MovScript Agent Plugin from GitHub Releases.

Usage:
  sh install-plugin.sh [options]

Options:
  --release <tag|latest>     Release tag to install. Defaults to latest.
  --repo <owner/repo>        GitHub repository. Defaults to movscript/movscript.
  --home <path>              MovScript home directory. Defaults to ~/.movscript.
  --asset <filename>         Plugin release asset filename. Defaults to auto-detect.
  --asset-prefix <prefix>    Asset prefix used for auto-detect.
  --local-zip <path>         Install a locally built plugin zip instead of downloading.
  --provider <name>          Agent provider registration target. Defaults to codex.
  --no-verify                Skip SHA256SUMS.txt verification.
  --dry-run                  Print actions without downloading or installing.
  -h, --help                 Show this help.

Environment overrides:
  MOVSCRIPT_GITHUB_REPO, MOVSCRIPT_RELEASE, MOVSCRIPT_HOME,
  MOVSCRIPT_PLUGIN_ASSET, MOVSCRIPT_PLUGIN_ASSET_PREFIX,
  MOVSCRIPT_PLUGIN_LOCAL_ZIP, MOVSCRIPT_AGENT_PROVIDER,
  MOVSCRIPT_CHECKSUM_ASSET.
EOF
}

log() {
  printf '%s\n' "movscript-plugin-install: $*"
}

fail() {
  printf '%s\n' "movscript-plugin-install: error: $*" >&2
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

stop_existing_local_node() {
  movscript="$PLUGIN_STORE/current/bin/movscript"
  legacy_launcher="$PLUGIN_STORE/current/bin/movscript-agent-mcp"
  if [ ! -x "$movscript" ] && [ ! -x "$legacy_launcher" ]; then
    return 0
  fi
  log "stopping existing MovScript local daemon before install"
  if [ -x "$movscript" ] && MOVSCRIPT_HOME="$MOVSCRIPT_HOME" "$movscript" daemon stop >/dev/null 2>&1; then
    log "existing local daemon stop requested"
  elif [ -x "$legacy_launcher" ] && MOVSCRIPT_HOME="$MOVSCRIPT_HOME" "$legacy_launcher" local-node stop >/dev/null 2>&1; then
    log "existing local-node stop requested through compatibility command"
  else
    log "warning: existing local daemon stop failed or was not running"
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
    --home)
      [ "$#" -ge 2 ] || fail "--home requires a value"
      MOVSCRIPT_HOME=$2
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
    --local-zip)
      [ "$#" -ge 2 ] || fail "--local-zip requires a value"
      LOCAL_ZIP=$2
      VERIFY_CHECKSUM=0
      shift 2
      ;;
    --provider)
      [ "$#" -ge 2 ] || fail "--provider requires a value"
      PROVIDER=$2
      shift 2
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

case "$REPO" in
  */*) ;;
  *) fail "--repo must be in owner/repo form" ;;
esac

case "$PROVIDER" in
  codex) ;;
  *) fail "unsupported provider: $PROVIDER" ;;
esac

if [ -n "$ASSET" ]; then
  case "$ASSET" in
    *.zip) ;;
    *) fail "this installer currently supports .zip plugin assets only: $ASSET" ;;
  esac
fi
if [ -n "$LOCAL_ZIP" ]; then
  case "$LOCAL_ZIP" in
    *.zip) ;;
    *) fail "--local-zip must point to a .zip file: $LOCAL_ZIP" ;;
  esac
  [ -f "$LOCAL_ZIP" ] || fail "local zip does not exist: $LOCAL_ZIP"
  ASSET=${ASSET:-$(basename "$LOCAL_ZIP")}
fi

require_command awk
require_command unzip
if [ -z "$LOCAL_ZIP" ]; then
  require_command curl
  require_command shasum
fi

CHECKSUM_URL=$(url_for_asset "$CHECKSUM_ASSET")
PLUGIN_STORE="$MOVSCRIPT_HOME/plugins/movscript"
CODEX_ROOT="$MOVSCRIPT_HOME/provider/codex"
CODEX_PLUGIN_LINK="$CODEX_ROOT/plugins/movscript"
CODEX_MARKETPLACE="$CODEX_ROOT/marketplace.json"

log "repository: $REPO"
log "release: $RELEASE"
log "provider: $PROVIDER"
log "movscript home: $MOVSCRIPT_HOME"
if [ -n "$ASSET" ]; then
  log "asset: $ASSET"
else
  log "asset: auto-detect ${ASSET_PREFIX}*.zip"
fi
if [ -n "$LOCAL_ZIP" ]; then
  log "local zip: $LOCAL_ZIP"
fi

if [ "$DRY_RUN" -eq 1 ]; then
  if [ -n "$LOCAL_ZIP" ]; then
    log "install from local zip: $LOCAL_ZIP"
  else
    log "checksum URL: $CHECKSUM_URL"
    if [ -n "$ASSET" ]; then
      log "download URL: $(url_for_asset "$ASSET")"
    else
      log "download URL: resolved from $CHECKSUM_ASSET"
    fi
  fi
  log "dry run complete"
  exit 0
fi

TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/movscript-plugin-install.XXXXXX")
SUMS_PATH="$TMP_DIR/$CHECKSUM_ASSET"
ZIP_PATH="$TMP_DIR/plugin.zip"
EXTRACT_DIR="$TMP_DIR/extract"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

if [ -z "$LOCAL_ZIP" ] && { [ "$VERIFY_CHECKSUM" -eq 1 ] || [ -z "$ASSET" ]; }; then
  log "downloading checksums"
  curl -fL --retry 3 --connect-timeout 20 --output "$SUMS_PATH" "$CHECKSUM_URL"
fi

if [ -z "$LOCAL_ZIP" ] && [ -z "$ASSET" ]; then
  ASSET=$(awk -v prefix="$ASSET_PREFIX" '
    {
      path = $2
      count = split(path, parts, "/")
      name = parts[count]
      if (index(name, prefix) == 1 && name ~ /\.zip$/) {
        print name
        exit
      }
    }
  ' "$SUMS_PATH")
  [ -n "$ASSET" ] || fail "could not find a ${ASSET_PREFIX}*.zip entry in $CHECKSUM_ASSET"
  log "resolved asset: $ASSET"
fi

ASSET_URL=$(url_for_asset "$ASSET")
if [ -z "$LOCAL_ZIP" ] && [ "$VERIFY_CHECKSUM" -eq 1 ]; then
  EXPECTED_SHA=$(awk -v asset="$ASSET" '
    $2 == asset { print $1; exit }
    $2 ~ "/" asset "$" { print $1; exit }
  ' "$SUMS_PATH")
  [ -n "$EXPECTED_SHA" ] || fail "checksum for $ASSET was not found in $CHECKSUM_ASSET"
fi

if [ -n "$LOCAL_ZIP" ]; then
  log "using local plugin package"
  cp "$LOCAL_ZIP" "$ZIP_PATH"
else
  log "downloading plugin package"
  curl -fL --retry 3 --connect-timeout 20 --output "$ZIP_PATH" "$ASSET_URL"
fi

if [ -z "$LOCAL_ZIP" ] && [ "$VERIFY_CHECKSUM" -eq 1 ]; then
  ACTUAL_SHA=$(shasum -a 256 "$ZIP_PATH" | awk '{ print $1 }')
  [ "$EXPECTED_SHA" = "$ACTUAL_SHA" ] || fail "checksum mismatch for $ASSET"
  log "checksum verified"
else
  log "checksum verification skipped"
fi

VERSION=${ASSET#"$ASSET_PREFIX"}
VERSION=${VERSION%.zip}
[ -n "$VERSION" ] || VERSION="$RELEASE"
TARGET_DIR="$PLUGIN_STORE/$VERSION"

rm -rf "$EXTRACT_DIR"
mkdir -p "$EXTRACT_DIR"
unzip -q "$ZIP_PATH" -d "$EXTRACT_DIR"

[ -f "$EXTRACT_DIR/.mcp.json" ] || fail "plugin package is missing .mcp.json"
[ -f "$EXTRACT_DIR/.codex-plugin/plugin.json" ] || fail "plugin package is missing .codex-plugin/plugin.json"
[ -f "$EXTRACT_DIR/bin/movscript" ] || fail "plugin package is missing bin/movscript"
[ -f "$EXTRACT_DIR/bin/movcli" ] || fail "plugin package is missing bin/movcli"
[ -f "$EXTRACT_DIR/bin/movscript-agent-mcp" ] || fail "plugin package is missing bin/movscript-agent-mcp"
[ -f "$EXTRACT_DIR/runtime/services/data-service/bin/movscript-server" ] || fail "plugin package is missing runtime/services/data-service/bin/movscript-server"
[ -f "$EXTRACT_DIR/runtime/services/local-surface-host/dist/index.html" ] || fail "plugin package is missing runtime/services/local-surface-host/dist/index.html"

stop_existing_local_node

log "installing plugin package to $TARGET_DIR"
mkdir -p "$PLUGIN_STORE"
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"
cp -R "$EXTRACT_DIR"/. "$TARGET_DIR"/
chmod +x "$TARGET_DIR/bin/movscript" 2>/dev/null || true
chmod +x "$TARGET_DIR/bin/movcli" 2>/dev/null || true
chmod +x "$TARGET_DIR/bin/movscript-agent-mcp" 2>/dev/null || true

rm -f "$PLUGIN_STORE/current"
ln -s "$TARGET_DIR" "$PLUGIN_STORE/current"

log "writing Codex marketplace registration"
mkdir -p "$CODEX_ROOT/plugins"
rm -f "$CODEX_PLUGIN_LINK"
ln -s "$PLUGIN_STORE/current" "$CODEX_PLUGIN_LINK"
cat > "$CODEX_MARKETPLACE" <<EOF
{
  "name": "movscript",
  "interface": {
    "displayName": "MovScript"
  },
  "plugins": [
    {
      "name": "movscript",
      "source": {
        "source": "local",
        "path": "./plugins/movscript"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
EOF

log "installed MovScript Agent Plugin $VERSION"
log "Codex marketplace: $CODEX_MARKETPLACE"
log "If Codex has not seen this marketplace before, add it with:"
log "  codex plugin marketplace add $CODEX_ROOT"
