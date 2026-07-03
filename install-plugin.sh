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
PLUGIN_RETAIN="${MOVSCRIPT_PLUGIN_RETAIN:-2}"
VERIFY_CHECKSUM=1
DRY_RUN=0
ROLLBACK=0
ROLLBACK_VERSION=""

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
  --retain <count>           Keep this many plugin bundle versions. Defaults to 2.
  --rollback                 Switch current plugin bundle back to the previous bundle.
  --rollback-version <ver>   Switch current plugin bundle to a retained version.
  --no-verify                Skip SHA256SUMS.txt verification.
  --dry-run                  Print actions without downloading or installing.
  -h, --help                 Show this help.

Environment overrides:
  MOVSCRIPT_GITHUB_REPO, MOVSCRIPT_RELEASE, MOVSCRIPT_HOME,
  MOVSCRIPT_PLUGIN_ASSET, MOVSCRIPT_PLUGIN_ASSET_PREFIX,
  MOVSCRIPT_PLUGIN_LOCAL_ZIP, MOVSCRIPT_AGENT_PROVIDER,
  MOVSCRIPT_CHECKSUM_ASSET, MOVSCRIPT_PLUGIN_RETAIN.
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

current_plugin_target() {
  if [ -L "$PLUGIN_STORE/current" ]; then
    target=$(readlink "$PLUGIN_STORE/current" 2>/dev/null || true)
    normalize_plugin_target "$target"
  fi
}

previous_plugin_target() {
  if [ -L "$PLUGIN_STORE/previous" ]; then
    target=$(readlink "$PLUGIN_STORE/previous" 2>/dev/null || true)
    normalize_plugin_target "$target"
  fi
}

normalize_plugin_target() {
  target=$1
  [ -n "$target" ] || return 0
  case "$target" in
    /*) printf '%s\n' "$target" ;;
    *) printf '%s\n' "$PLUGIN_STORE/$target" ;;
  esac
}

canonical_dir() {
  if [ -d "$1" ]; then
    (cd "$1" 2>/dev/null && pwd -P) || printf '%s\n' "$1"
  else
    printf '%s\n' "$1"
  fi
}

same_dir() {
  [ -n "$1" ] && [ -n "$2" ] || return 1
  [ "$(canonical_dir "$1")" = "$(canonical_dir "$2")" ]
}

switch_plugin_pointer() {
  link_path=$1
  target_path=$2
  [ -d "$target_path" ] || fail "plugin bundle does not exist: $target_path"
  if [ -e "$link_path" ] && [ ! -L "$link_path" ]; then
    fail "cannot replace non-symlink plugin pointer: $link_path"
  fi
  tmp_link="$link_path.next.$$"
  rm -f "$tmp_link"
  ln -s "$target_path" "$tmp_link"
  rm -f "$link_path"
  mv "$tmp_link" "$link_path"
}

version_from_target() {
  target_path=$1
  printf '%s\n' "${target_path##*/}"
}

runtime_manifest_field() {
  target_path=$1
  field_name=$2
  manifest_path="$target_path/manifest.runtime.json"
  [ -f "$manifest_path" ] || return 0
  sed -n "s/.*\"$field_name\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" "$manifest_path" | head -n 1
}

write_bundle_identity() {
  target_path=$1
  version=$2
  previous_target=$3
  reason=$4
  identity_path="$PLUGIN_STORE/current.identity"
  installed_at=$(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date)
  bundle_hash=$(runtime_manifest_field "$target_path" bundleHash)
  api_version=$(runtime_manifest_field "$target_path" apiVersion)
  min_daemon_api_version=$(runtime_manifest_field "$target_path" minDaemonApiVersion)
  {
    printf 'schema=movscript.agent-plugin-bundle.v1\n'
    printf 'version=%s\n' "$version"
    printf 'pluginRoot=%s\n' "$target_path"
    printf 'currentLink=%s\n' "$PLUGIN_STORE/current"
    printf 'previousRoot=%s\n' "${previous_target:-}"
    printf 'installedAt=%s\n' "$installed_at"
    printf 'reason=%s\n' "$reason"
    printf 'release=%s\n' "$RELEASE"
    printf 'asset=%s\n' "${ASSET:-}"
    printf 'provider=%s\n' "$PROVIDER"
    printf 'bundleHash=%s\n' "${bundle_hash:-}"
    printf 'apiVersion=%s\n' "${api_version:-}"
    printf 'minDaemonApiVersion=%s\n' "${min_daemon_api_version:-}"
  } > "$identity_path"
  log "bundle identity: version=$version root=$target_path previous=${previous_target:-none} reason=$reason"
  log "bundle identity file: $identity_path"
}

write_home_cli_shim() {
  log "writing MovScript CLI shim to $MOVSCRIPT_BIN"
  mkdir -p "$MOVSCRIPT_BIN"
  cat > "$MOVSCRIPT_BIN/movscript.mjs" <<'EOF'
#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const shimHomeDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const homeDir = process.env.MOVSCRIPT_HOME?.trim() || shimHomeDir
const pluginRoot = resolve(homeDir, 'plugins/movscript/current')
const modernEntry = resolve(pluginRoot, 'bin/movscript.mjs')
const legacyEntry = resolve(pluginRoot, 'bin/movscript-agent-mcp.mjs')
const pluginEntry = existsSync(modernEntry) ? modernEntry : existsSync(legacyEntry) ? legacyEntry : undefined

if (!pluginEntry) {
  console.error(`MovScript current plugin CLI entrypoint was not found under ${pluginRoot}.`)
  process.exit(1)
}

process.argv = [process.argv[0] ?? 'node', pluginEntry, ...process.argv.slice(2)]
await import(pathToFileURL(pluginEntry).href)
EOF
  cat > "$MOVSCRIPT_BIN/movscript" <<'EOF'
#!/bin/sh
set -eu
script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)
if [ -n "${MOVSCRIPT_NODE_BIN:-}" ]; then
  exec "$MOVSCRIPT_NODE_BIN" "$script_dir/movscript.mjs" "$@"
fi
if [ -n "${MOVSCRIPT_ELECTRON_BIN:-}" ]; then
  ELECTRON_RUN_AS_NODE=1 exec "$MOVSCRIPT_ELECTRON_BIN" "$script_dir/movscript.mjs" "$@"
fi
exec node "$script_dir/movscript.mjs" "$@"
EOF
  cat > "$MOVSCRIPT_BIN/movscript.cmd" <<'EOF'
@echo off
setlocal
set "ENTRY=%~dp0movscript.mjs"
if defined MOVSCRIPT_NODE_BIN (
  "%MOVSCRIPT_NODE_BIN%" "%ENTRY%" %*
  exit /b %ERRORLEVEL%
)
if defined MOVSCRIPT_ELECTRON_BIN (
  set "ELECTRON_RUN_AS_NODE=1"
  "%MOVSCRIPT_ELECTRON_BIN%" "%ENTRY%" %*
  exit /b %ERRORLEVEL%
)
node "%ENTRY%" %*
exit /b %ERRORLEVEL%
EOF
  chmod +x "$MOVSCRIPT_BIN/movscript" "$MOVSCRIPT_BIN/movscript.mjs" 2>/dev/null || true
}

write_provider_registration() {
  log "writing Codex marketplace registration"
  mkdir -p "$CODEX_ROOT/plugins"
  switch_plugin_pointer "$CODEX_PLUGIN_LINK" "$PLUGIN_STORE/current"
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
}

is_plugin_bundle_dir() {
  [ -f "$1/.mcp.json" ] && [ -f "$1/.codex-plugin/plugin.json" ]
}

prune_plugin_versions() {
  retain_count=$1
  current_target=$(current_plugin_target)
  previous_target=$(previous_plugin_target)
  if [ "$retain_count" -le 1 ]; then
    rm -f "$PLUGIN_STORE/previous"
    previous_target=""
  fi
  kept=0
  if [ -n "$current_target" ]; then
    kept=$((kept + 1))
  fi
  if [ -n "$previous_target" ] && ! same_dir "$previous_target" "$current_target"; then
    kept=$((kept + 1))
  fi
  for dir in "$PLUGIN_STORE"/*; do
    [ -d "$dir" ] || continue
    [ -L "$dir" ] && continue
    name=${dir##*/}
    case "$name" in
      current|previous|release|.*) continue ;;
    esac
    is_plugin_bundle_dir "$dir" || continue
    if same_dir "$dir" "$current_target" || same_dir "$dir" "$previous_target"; then
      continue
    fi
    if [ "$kept" -lt "$retain_count" ]; then
      kept=$((kept + 1))
      log "retaining extra plugin bundle version: $dir"
    else
      log "pruning old plugin bundle version: $dir"
      rm -rf "$dir"
    fi
  done
}

perform_plugin_rollback() {
  mkdir -p "$PLUGIN_STORE"
  old_current=$(current_plugin_target)
  if [ -n "$ROLLBACK_VERSION" ]; then
    rollback_target="$PLUGIN_STORE/$ROLLBACK_VERSION"
  else
    rollback_target=$(previous_plugin_target)
  fi
  [ -n "$rollback_target" ] || fail "no previous plugin bundle is available for rollback"
  [ -d "$rollback_target" ] || fail "rollback plugin bundle does not exist: $rollback_target"
  if [ "$DRY_RUN" -eq 1 ]; then
    log "would rollback current plugin bundle to $rollback_target"
    log "dry run complete"
    exit 0
  fi
  stop_existing_local_node
  switch_plugin_pointer "$PLUGIN_STORE/current" "$rollback_target"
  if [ -n "$old_current" ] && [ -d "$old_current" ] && ! same_dir "$old_current" "$rollback_target"; then
    switch_plugin_pointer "$PLUGIN_STORE/previous" "$old_current"
  fi
  write_home_cli_shim
  write_provider_registration
  write_bundle_identity "$rollback_target" "$(version_from_target "$rollback_target")" "$old_current" "rollback"
  log "rolled back MovScript Agent Plugin to $(version_from_target "$rollback_target")"
  exit 0
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
    --retain)
      [ "$#" -ge 2 ] || fail "--retain requires a value"
      PLUGIN_RETAIN=$2
      shift 2
      ;;
    --rollback)
      ROLLBACK=1
      shift
      ;;
    --rollback-version)
      [ "$#" -ge 2 ] || fail "--rollback-version requires a value"
      ROLLBACK=1
      ROLLBACK_VERSION=$2
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

case "$PLUGIN_RETAIN" in
  ''|*[!0-9]*) fail "--retain must be a positive integer" ;;
esac
[ "$PLUGIN_RETAIN" -ge 1 ] || fail "--retain must be at least 1"

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

PLUGIN_STORE="$MOVSCRIPT_HOME/plugins/movscript"
MOVSCRIPT_BIN="$MOVSCRIPT_HOME/bin"
CODEX_ROOT="$MOVSCRIPT_HOME/provider/codex"
CODEX_PLUGIN_LINK="$CODEX_ROOT/plugins/movscript"
CODEX_MARKETPLACE="$CODEX_ROOT/marketplace.json"

if [ "$ROLLBACK" -eq 0 ]; then
  require_command awk
  require_command unzip
  if [ -z "$LOCAL_ZIP" ]; then
    require_command curl
    require_command shasum
  fi
fi

CHECKSUM_URL=$(url_for_asset "$CHECKSUM_ASSET")

log "repository: $REPO"
log "release: $RELEASE"
log "provider: $PROVIDER"
log "movscript home: $MOVSCRIPT_HOME"
log "plugin retain count: $PLUGIN_RETAIN"
if [ -n "$ASSET" ]; then
  log "asset: $ASSET"
else
  log "asset: auto-detect ${ASSET_PREFIX}*.zip"
fi
if [ -n "$LOCAL_ZIP" ]; then
  log "local zip: $LOCAL_ZIP"
fi
if [ "$ROLLBACK" -eq 1 ]; then
  if [ -n "$ROLLBACK_VERSION" ]; then
    log "rollback version: $ROLLBACK_VERSION"
  else
    log "rollback target: previous"
  fi
  perform_plugin_rollback
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
STAGING_DIR=""
BACKUP_DIR=""
TARGET_DIR=""
PREVIOUS_CURRENT_TARGET=""
PREVIOUS_PREVIOUS_TARGET=""
INSTALL_STARTED=0
INSTALL_COMMITTED=0
TARGET_REPLACED=0

cleanup() {
  status=$?
  if [ "$status" -ne 0 ] && [ "$INSTALL_STARTED" -eq 1 ] && [ "$INSTALL_COMMITTED" -eq 0 ]; then
    log "install failed; rolling back plugin pointer"
    rm -rf "$STAGING_DIR"
    if [ "$TARGET_REPLACED" -eq 1 ] && [ -n "$TARGET_DIR" ]; then
      rm -rf "$TARGET_DIR"
    fi
    if [ -n "$BACKUP_DIR" ] && [ -d "$BACKUP_DIR" ]; then
      mv "$BACKUP_DIR" "$TARGET_DIR"
    fi
    rm -f "$PLUGIN_STORE/current"
    if [ -n "$PREVIOUS_CURRENT_TARGET" ] && [ -e "$PREVIOUS_CURRENT_TARGET" ]; then
      ln -s "$PREVIOUS_CURRENT_TARGET" "$PLUGIN_STORE/current"
    fi
    rm -f "$PLUGIN_STORE/previous"
    if [ -n "$PREVIOUS_PREVIOUS_TARGET" ] && [ -e "$PREVIOUS_PREVIOUS_TARGET" ]; then
      ln -s "$PREVIOUS_PREVIOUS_TARGET" "$PLUGIN_STORE/previous"
    fi
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

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
STAGING_DIR="$PLUGIN_STORE/.installing-$VERSION.$$"
BACKUP_DIR="$PLUGIN_STORE/.rollback-$VERSION.$$"

rm -rf "$EXTRACT_DIR"
mkdir -p "$EXTRACT_DIR"
unzip -q "$ZIP_PATH" -d "$EXTRACT_DIR"

[ -f "$EXTRACT_DIR/.mcp.json" ] || fail "plugin package is missing .mcp.json"
[ -f "$EXTRACT_DIR/.codex-plugin/plugin.json" ] || fail "plugin package is missing .codex-plugin/plugin.json"
[ -f "$EXTRACT_DIR/bin/movscript" ] || fail "plugin package is missing bin/movscript"
[ -f "$EXTRACT_DIR/bin/movscript.mjs" ] || fail "plugin package is missing bin/movscript.mjs"
[ -f "$EXTRACT_DIR/bin/movscript-agent-mcp" ] || fail "plugin package is missing bin/movscript-agent-mcp"
[ -f "$EXTRACT_DIR/runtime/services/data-service/bin/movscript-server" ] || fail "plugin package is missing runtime/services/data-service/bin/movscript-server"
[ -f "$EXTRACT_DIR/runtime/services/local-surface-host/dist/index.html" ] || fail "plugin package is missing runtime/services/local-surface-host/dist/index.html"

stop_existing_local_node

log "installing plugin package to $TARGET_DIR"
mkdir -p "$PLUGIN_STORE"
PREVIOUS_CURRENT_TARGET=$(current_plugin_target)
PREVIOUS_PREVIOUS_TARGET=$(previous_plugin_target)
INSTALL_STARTED=1
rm -rf "$STAGING_DIR" "$BACKUP_DIR"
mkdir -p "$STAGING_DIR"
cp -R "$EXTRACT_DIR"/. "$STAGING_DIR"/
chmod +x "$STAGING_DIR/bin/movscript" 2>/dev/null || true
chmod +x "$STAGING_DIR/bin/movscript-agent-mcp" 2>/dev/null || true
if [ -e "$TARGET_DIR" ] || [ -L "$TARGET_DIR" ]; then
  mv "$TARGET_DIR" "$BACKUP_DIR"
  TARGET_REPLACED=1
fi
mv "$STAGING_DIR" "$TARGET_DIR"
TARGET_REPLACED=1

switch_plugin_pointer "$PLUGIN_STORE/current" "$TARGET_DIR"
if [ -n "$PREVIOUS_CURRENT_TARGET" ] && [ -d "$PREVIOUS_CURRENT_TARGET" ] && ! same_dir "$PREVIOUS_CURRENT_TARGET" "$TARGET_DIR"; then
  switch_plugin_pointer "$PLUGIN_STORE/previous" "$PREVIOUS_CURRENT_TARGET"
else
  rm -f "$PLUGIN_STORE/previous"
fi

write_home_cli_shim
write_provider_registration

INSTALL_COMMITTED=1
rm -rf "$BACKUP_DIR"
write_bundle_identity "$TARGET_DIR" "$VERSION" "$PREVIOUS_CURRENT_TARGET" "install"
prune_plugin_versions "$PLUGIN_RETAIN"
log "installed MovScript Agent Plugin $VERSION"
log "Codex marketplace: $CODEX_MARKETPLACE"
log "If Codex has not seen this marketplace before, add it with:"
log "  codex plugin marketplace add $CODEX_ROOT"
