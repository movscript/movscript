import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, readdirSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import {
  validateRuntimeBundleManifest,
  type RuntimeBundleManifest,
} from '@movscript/runtime-contracts'

export const MOVSCRIPT_HOME_PLUGIN_NAME = 'movscript'
export const MOVSCRIPT_HOME_PLUGIN_IDENTITY_SCHEMA = 'movscript.agent-plugin-bundle.v1'

export interface MovScriptHomePluginStorePaths {
  homeDir: string
  pluginStore: string
  currentLink: string
  previousLink: string
  identityPath: string
  binDir: string
}

export interface InstallMovScriptHomePluginBundleOptions {
  homeDir: string
  sourcePluginRoot: string
  mode?: 'replace' | 'seed-or-upgrade' | 'repair'
  reason?: string
  retain?: number
  release?: string
  asset?: string
  provider?: string
  now?: Date
}

export interface InstallMovScriptHomePluginBundleResult {
  paths: MovScriptHomePluginStorePaths
  sourcePluginRoot: string
  targetPluginRoot: string
  previousPluginRoot?: string
  version: string
  bundleHash?: string
  identityPath: string
  installed: boolean
}

export interface RollbackMovScriptHomePluginBundleOptions {
  homeDir: string
  reason?: string
  release?: string
  asset?: string
  provider?: string
  now?: Date
}

export interface RollbackMovScriptHomePluginBundleResult {
  paths: MovScriptHomePluginStorePaths
  targetPluginRoot: string
  previousPluginRoot?: string
  version: string
  bundleHash?: string
  identityPath: string
}

export interface MovScriptHomePluginBundleIdentity {
  schema: typeof MOVSCRIPT_HOME_PLUGIN_IDENTITY_SCHEMA
  version: string
  pluginRoot: string
  currentLink: string
  previousRoot?: string
  installedAt: string
  reason: string
  release?: string
  asset?: string
  provider?: string
  bundleHash?: string
  apiVersion?: string
  minDaemonApiVersion?: string
}

export function resolveMovScriptHomePluginStorePaths(homeDir: string): MovScriptHomePluginStorePaths {
  const pluginStore = resolve(homeDir, 'plugins', MOVSCRIPT_HOME_PLUGIN_NAME)
  return {
    homeDir,
    pluginStore,
    currentLink: resolve(pluginStore, 'current'),
    previousLink: resolve(pluginStore, 'previous'),
    identityPath: resolve(pluginStore, 'current.identity'),
    binDir: resolve(homeDir, 'bin'),
  }
}

export function installMovScriptHomePluginBundle(
  options: InstallMovScriptHomePluginBundleOptions,
): InstallMovScriptHomePluginBundleResult {
  const paths = resolveMovScriptHomePluginStorePaths(options.homeDir)
  const sourcePluginRoot = canonicalDirectory(options.sourcePluginRoot)
  const manifest = readMovScriptRuntimeBundleManifest(sourcePluginRoot)
  validateMovScriptHomePluginBundle(sourcePluginRoot, manifest)
  const version = manifest?.version ?? readPluginVersion(sourcePluginRoot) ?? 'unknown'
  const targetPluginRoot = resolve(paths.pluginStore, pluginBundleDirectoryName(version, manifest?.bundleHash))
  const stagingRoot = resolve(paths.pluginStore, `.installing-${safePathPart(version)}-${process.pid}-${Date.now()}`)
  const backupRoot = resolve(paths.pluginStore, `.rollback-${safePathPart(version)}-${process.pid}-${Date.now()}`)
  const previousPluginRoot = resolvePluginPointer(paths.currentLink, paths.pluginStore)
  const previousPreviousRoot = resolvePluginPointer(paths.previousLink, paths.pluginStore)
  const installMode = options.mode ?? 'replace'
  if (installMode === 'seed-or-upgrade' && previousPluginRoot && isPluginBundleDirectory(previousPluginRoot)) {
    const previousManifest = readMovScriptRuntimeBundleManifest(previousPluginRoot)
    const previousVersion = previousManifest?.version ?? readPluginVersion(previousPluginRoot)
    if (shouldReuseCurrentPluginBundle({
      currentVersion: previousVersion,
      currentBundleHash: previousManifest?.bundleHash,
      sourceVersion: version,
      sourceBundleHash: manifest?.bundleHash,
    })) {
      writeMovScriptHomeCliShim(paths)
      writeMovScriptHomePluginBundleIdentity(paths, {
        version: previousVersion ?? version,
        pluginRoot: previousPluginRoot,
        previousRoot: resolvePluginPointer(paths.previousLink, paths.pluginStore),
        reason: options.reason ?? 'reuse-current',
        release: options.release,
        asset: options.asset,
        provider: options.provider,
        bundleHash: previousManifest?.bundleHash,
        apiVersion: previousManifest?.apiVersion,
        minDaemonApiVersion: previousManifest?.minDaemonApiVersion,
        now: options.now,
      })
      return {
        paths,
        sourcePluginRoot,
        targetPluginRoot: previousPluginRoot,
        version: previousVersion ?? version,
        ...(previousManifest?.bundleHash ? { bundleHash: previousManifest.bundleHash } : {}),
        identityPath: paths.identityPath,
        installed: false,
      }
    }
  }
  let targetReplaced = false
  mkdirSync(paths.pluginStore, { recursive: true })
  rmSync(stagingRoot, { recursive: true, force: true })
  rmSync(backupRoot, { recursive: true, force: true })

  try {
    cpSync(sourcePluginRoot, stagingRoot, { recursive: true })
    makePluginEntrypointsExecutable(stagingRoot)
    if (existsSync(targetPluginRoot) || isSymlink(targetPluginRoot)) {
      renameSync(targetPluginRoot, backupRoot)
      targetReplaced = true
    }
    renameSync(stagingRoot, targetPluginRoot)
    targetReplaced = true

    switchPluginPointer(paths.currentLink, targetPluginRoot)
    if (previousPluginRoot && existsSync(previousPluginRoot) && !sameDirectory(previousPluginRoot, targetPluginRoot)) {
      switchPluginPointer(paths.previousLink, previousPluginRoot)
    } else {
      rmSync(paths.previousLink, { force: true })
    }
    writeMovScriptHomeCliShim(paths)
    writeMovScriptHomePluginBundleIdentity(paths, {
      version,
      pluginRoot: targetPluginRoot,
      previousRoot: previousPluginRoot,
      reason: options.reason ?? 'install',
      release: options.release,
      asset: options.asset,
      provider: options.provider,
      bundleHash: manifest?.bundleHash,
      apiVersion: manifest?.apiVersion,
      minDaemonApiVersion: manifest?.minDaemonApiVersion,
      now: options.now,
    })
    pruneMovScriptHomePluginBundles(paths, options.retain ?? 2)
    rmSync(backupRoot, { recursive: true, force: true })
    return {
      paths,
      sourcePluginRoot,
      targetPluginRoot,
      ...(previousPluginRoot ? { previousPluginRoot } : {}),
      version,
      ...(manifest?.bundleHash ? { bundleHash: manifest.bundleHash } : {}),
      identityPath: paths.identityPath,
      installed: true,
    }
  } catch (error) {
    rmSync(stagingRoot, { recursive: true, force: true })
    restorePluginPointer(paths.currentLink, previousPluginRoot)
    restorePluginPointer(paths.previousLink, previousPreviousRoot)
    if (targetReplaced && existsSync(backupRoot)) {
      rmSync(targetPluginRoot, { recursive: true, force: true })
      renameSync(backupRoot, targetPluginRoot)
    } else {
      rmSync(backupRoot, { recursive: true, force: true })
    }
    throw error
  }
}

export function readMovScriptHomePluginBundleIdentity(homeDir: string): MovScriptHomePluginBundleIdentity | undefined {
  const identityPath = resolveMovScriptHomePluginStorePaths(homeDir).identityPath
  if (!existsSync(identityPath)) return undefined
  const fields: Record<string, string> = {}
  for (const line of readFileSync(identityPath, 'utf8').split(/\r?\n/)) {
    const index = line.indexOf('=')
    if (index <= 0) continue
    fields[line.slice(0, index)] = line.slice(index + 1)
  }
  if (fields.schema !== MOVSCRIPT_HOME_PLUGIN_IDENTITY_SCHEMA || !fields.version || !fields.pluginRoot || !fields.currentLink || !fields.installedAt || !fields.reason) {
    return undefined
  }
  return {
    schema: MOVSCRIPT_HOME_PLUGIN_IDENTITY_SCHEMA,
    version: fields.version,
    pluginRoot: fields.pluginRoot,
    currentLink: fields.currentLink,
    ...(fields.previousRoot ? { previousRoot: fields.previousRoot } : {}),
    installedAt: fields.installedAt,
    reason: fields.reason,
    ...(fields.release ? { release: fields.release } : {}),
    ...(fields.asset ? { asset: fields.asset } : {}),
    ...(fields.provider ? { provider: fields.provider } : {}),
    ...(fields.bundleHash ? { bundleHash: fields.bundleHash } : {}),
    ...(fields.apiVersion ? { apiVersion: fields.apiVersion } : {}),
    ...(fields.minDaemonApiVersion ? { minDaemonApiVersion: fields.minDaemonApiVersion } : {}),
  }
}

export function rollbackMovScriptHomePluginBundle(
  options: RollbackMovScriptHomePluginBundleOptions,
): RollbackMovScriptHomePluginBundleResult {
  const paths = resolveMovScriptHomePluginStorePaths(options.homeDir)
  const targetPluginRoot = resolvePluginPointer(paths.previousLink, paths.pluginStore)
  if (!targetPluginRoot || !isPluginBundleDirectory(targetPluginRoot)) {
    throw new Error('MovScript Home plugin store has no previous bundle available for rollback')
  }
  const previousPluginRoot = resolvePluginPointer(paths.currentLink, paths.pluginStore)
  const manifest = readMovScriptRuntimeBundleManifest(targetPluginRoot)
  const version = manifest?.version ?? readPluginVersion(targetPluginRoot) ?? 'unknown'
  switchPluginPointer(paths.currentLink, targetPluginRoot)
  if (previousPluginRoot && existsSync(previousPluginRoot) && !sameDirectory(previousPluginRoot, targetPluginRoot)) {
    switchPluginPointer(paths.previousLink, previousPluginRoot)
  } else {
    rmSync(paths.previousLink, { force: true })
  }
  writeMovScriptHomeCliShim(paths)
  writeMovScriptHomePluginBundleIdentity(paths, {
    version,
    pluginRoot: targetPluginRoot,
    previousRoot: previousPluginRoot,
    reason: options.reason ?? 'rollback',
    release: options.release,
    asset: options.asset,
    provider: options.provider,
    bundleHash: manifest?.bundleHash,
    apiVersion: manifest?.apiVersion,
    minDaemonApiVersion: manifest?.minDaemonApiVersion,
    now: options.now,
  })
  return {
    paths,
    targetPluginRoot,
    ...(previousPluginRoot ? { previousPluginRoot } : {}),
    version,
    ...(manifest?.bundleHash ? { bundleHash: manifest.bundleHash } : {}),
    identityPath: paths.identityPath,
  }
}

export function resolveMovScriptHomeCurrentPluginRoot(homeDir: string): string | undefined {
  const paths = resolveMovScriptHomePluginStorePaths(homeDir)
  return resolvePluginPointer(paths.currentLink, paths.pluginStore)
}

export function resolveMovScriptHomePreviousPluginRoot(homeDir: string): string | undefined {
  const paths = resolveMovScriptHomePluginStorePaths(homeDir)
  return resolvePluginPointer(paths.previousLink, paths.pluginStore)
}

function readMovScriptRuntimeBundleManifest(pluginRoot: string): RuntimeBundleManifest | undefined {
  try {
    const parsed = JSON.parse(readFileSync(resolve(pluginRoot, 'manifest.runtime.json'), 'utf8')) as unknown
    const result = validateRuntimeBundleManifest(parsed)
    return result.ok ? result.manifest : undefined
  } catch {
    return undefined
  }
}

function shouldReuseCurrentPluginBundle(input: {
  currentVersion: string | undefined
  currentBundleHash: string | undefined
  sourceVersion: string
  sourceBundleHash: string | undefined
}): boolean {
  const versionComparison = compareVersionStrings(input.currentVersion, input.sourceVersion)
  if (versionComparison > 0) return true
  if (versionComparison < 0) return false
  if (input.sourceBundleHash && input.currentBundleHash) return input.sourceBundleHash === input.currentBundleHash
  if (input.sourceBundleHash && !input.currentBundleHash) return false
  return true
}

function validateMovScriptHomePluginBundle(pluginRoot: string, manifest: RuntimeBundleManifest | undefined): void {
  const required = [
    '.mcp.json',
    '.codex-plugin/plugin.json',
    'bin/movscript',
    'bin/movscript.mjs',
    'bin/movscript-agent-mcp',
  ]
  const missing = required.filter((path) => !existsSync(resolve(pluginRoot, path)))
  if (missing.length > 0) {
    throw new Error(`MovScript plugin bundle is missing required files:\n${missing.map((path) => `- ${path}`).join('\n')}`)
  }
  if (manifest && manifest.schema !== 'movscript.runtime-bundle.v1') {
    throw new Error(`MovScript plugin bundle has invalid runtime manifest schema: ${manifest.schema}`)
  }
}

function readPluginVersion(pluginRoot: string): string | undefined {
  for (const manifestPath of [
    resolve(pluginRoot, 'manifest.runtime.json'),
    resolve(pluginRoot, '.codex-plugin/plugin.json'),
    resolve(pluginRoot, '.provider-plugin/plugin.json'),
  ]) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
      if (typeof manifest.version === 'string' && manifest.version.trim()) return manifest.version.trim()
    } catch {
      // Try the next manifest.
    }
  }
  return undefined
}

function writeMovScriptHomePluginBundleIdentity(
  paths: MovScriptHomePluginStorePaths,
  input: {
    version: string
    pluginRoot: string
    previousRoot?: string
    reason: string
    release?: string
    asset?: string
    provider?: string
    bundleHash?: string
    apiVersion?: string
    minDaemonApiVersion?: string
    now?: Date
  },
): void {
  const installedAt = (input.now ?? new Date()).toISOString()
  mkdirSync(dirname(paths.identityPath), { recursive: true })
  writeFileSync(paths.identityPath, [
    `schema=${MOVSCRIPT_HOME_PLUGIN_IDENTITY_SCHEMA}`,
    `version=${input.version}`,
    `pluginRoot=${input.pluginRoot}`,
    `currentLink=${paths.currentLink}`,
    `previousRoot=${input.previousRoot ?? ''}`,
    `installedAt=${installedAt}`,
    `reason=${input.reason}`,
    `release=${input.release ?? ''}`,
    `asset=${input.asset ?? ''}`,
    `provider=${input.provider ?? ''}`,
    `bundleHash=${input.bundleHash ?? ''}`,
    `apiVersion=${input.apiVersion ?? ''}`,
    `minDaemonApiVersion=${input.minDaemonApiVersion ?? ''}`,
    '',
  ].join('\n'), 'utf8')
}

function writeMovScriptHomeCliShim(paths: MovScriptHomePluginStorePaths): void {
  mkdirSync(paths.binDir, { recursive: true })
  writeFileSync(resolve(paths.binDir, 'movscript.mjs'), `#!/usr/bin/env node

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
  console.error(\`MovScript current plugin CLI entrypoint was not found under \${pluginRoot}.\`)
  process.exit(1)
}

process.argv = [process.argv[0] ?? 'node', pluginEntry, ...process.argv.slice(2)]
await import(pathToFileURL(pluginEntry).href)
`, 'utf8')
  writeFileSync(resolve(paths.binDir, 'movscript'), `#!/bin/sh
set -eu
script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)
if [ -n "\${MOVSCRIPT_NODE_BIN:-}" ]; then
  exec "$MOVSCRIPT_NODE_BIN" "$script_dir/movscript.mjs" "$@"
fi
if [ -n "\${MOVSCRIPT_ELECTRON_BIN:-}" ]; then
  ELECTRON_RUN_AS_NODE=1 exec "$MOVSCRIPT_ELECTRON_BIN" "$script_dir/movscript.mjs" "$@"
fi
exec node "$script_dir/movscript.mjs" "$@"
`, 'utf8')
  writeFileSync(resolve(paths.binDir, 'movscript.cmd'), `@echo off
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
`, 'utf8')
  chmodSync(resolve(paths.binDir, 'movscript'), 0o755)
  chmodSync(resolve(paths.binDir, 'movscript.mjs'), 0o755)
}

function pruneMovScriptHomePluginBundles(paths: MovScriptHomePluginStorePaths, retain: number): void {
  const retainCount = Math.max(1, Math.floor(retain))
  const current = resolvePluginPointer(paths.currentLink, paths.pluginStore)
  const previous = retainCount > 1 ? resolvePluginPointer(paths.previousLink, paths.pluginStore) : undefined
  if (retainCount <= 1) rmSync(paths.previousLink, { force: true })
  const protectedRoots = new Set([current, previous].filter((path): path is string => Boolean(path)).map(canonicalDirectory))
  let extraKept = 0
  for (const entry of safeReaddir(paths.pluginStore).sort().reverse()) {
    if (entry === 'current' || entry === 'previous' || entry === 'current.identity' || entry.startsWith('.')) continue
    const path = resolve(paths.pluginStore, entry)
    if (!isPluginBundleDirectory(path)) continue
    if (protectedRoots.has(canonicalDirectory(path))) continue
    extraKept += 1
    if (extraKept <= Math.max(0, retainCount - protectedRoots.size)) continue
    rmSync(path, { recursive: true, force: true })
  }
}

function restorePluginPointer(linkPath: string, targetRoot: string | undefined): void {
  rmSync(linkPath, { force: true })
  if (targetRoot && existsSync(targetRoot)) switchPluginPointer(linkPath, targetRoot)
}

function switchPluginPointer(linkPath: string, targetRoot: string): void {
  mkdirSync(dirname(linkPath), { recursive: true })
  const tmpLink = `${linkPath}.next.${process.pid}.${Date.now()}`
  rmSync(tmpLink, { recursive: true, force: true })
  symlinkSync(targetRoot, tmpLink, process.platform === 'win32' ? 'junction' : 'dir')
  rmSync(linkPath, { recursive: true, force: true })
  renameSync(tmpLink, linkPath)
}

function resolvePluginPointer(linkPath: string, pluginStore: string): string | undefined {
  try {
    if (!lstatSync(linkPath).isSymbolicLink()) return undefined
    const target = readlinkSync(linkPath)
    return canonicalDirectory(isAbsolute(target) ? target : resolve(pluginStore, target))
  } catch {
    return undefined
  }
}

function makePluginEntrypointsExecutable(pluginRoot: string): void {
  for (const path of [
    resolve(pluginRoot, 'bin/movscript'),
    resolve(pluginRoot, 'bin/movscript.mjs'),
    resolve(pluginRoot, 'bin/movscript-agent-mcp'),
    resolve(pluginRoot, 'bin/movscript-agent-mcp.mjs'),
  ]) {
    if (existsSync(path)) chmodSync(path, 0o755)
  }
}

function isPluginBundleDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
      && existsSync(resolve(path, '.mcp.json'))
      && existsSync(resolve(path, '.codex-plugin/plugin.json'))
  } catch {
    return false
  }
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink()
  } catch {
    return false
  }
}

function sameDirectory(left: string, right: string): boolean {
  return canonicalDirectory(left) === canonicalDirectory(right)
}

function canonicalDirectory(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

function safeReaddir(path: string): string[] {
  try {
    return readdirSync(path)
  } catch {
    return []
  }
}

function safePathPart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '_') || 'unknown'
}

function pluginBundleDirectoryName(version: string, bundleHash: string | undefined): string {
  const versionPart = safePathPart(version)
  const hashPart = bundleHash?.replace(/[^A-Fa-f0-9]+/g, '').slice(0, 12)
  return hashPart ? `${versionPart}+${hashPart}` : versionPart
}

function compareVersionStrings(left: string | undefined, right: string | undefined): number {
  if (!left && !right) return 0
  if (!left) return -1
  if (!right) return 1
  const leftParts = versionParts(left)
  const rightParts = versionParts(right)
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const leftPart = leftParts[index] ?? 0
    const rightPart = rightParts[index] ?? 0
    if (leftPart > rightPart) return 1
    if (leftPart < rightPart) return -1
  }
  return 0
}

function versionParts(value: string): number[] {
  const core = value.trim().replace(/^v/i, '').split(/[+-]/, 1)[0] ?? value
  return core.split('.').map((part) => {
    const parsed = Number(part.replace(/\D.*$/, ''))
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0
  })
}
