import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve, win32 as pathWin32 } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveMovScriptWorkspaceRootPaths } from '@movscript/workspace/home'

const require = createRequire(import.meta.url)
const moduleDir = dirname(fileURLToPath(import.meta.url))

export type MovScriptCliPathInput = {
  cwd?: string
  dirname?: string
  workspaceDir?: string
  resourcesPath?: string
  isPackaged?: boolean
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  exists?: (path: string) => boolean
}

export function resolveMovScriptCliBinDir(input: MovScriptCliPathInput = {}): string | undefined {
  const env = input.env ?? process.env
  const exists = input.exists ?? existsSync
  const platform = input.platform ?? process.platform
  const workspace = resolveWorkspaceMovScriptCliBinDir(input)
  if (input.workspaceDir?.trim() && workspace && movscriptCliBinExists(workspace, exists, platform)) return workspace

  const override = env.MOVSCRIPT_CLI_BIN_DIR?.trim()
  const overrideDir = override ? resolveForPlatform(override, platform) : undefined
  if (overrideDir && movscriptCliBinExists(overrideDir, exists, platform)) return overrideDir

  if (workspace && movscriptCliBinExists(workspace, exists, platform)) return workspace

  const packagedPlugin = resolvePackagedMovScriptPluginDir(input)
  if (packagedPlugin && movscriptCliPluginPackageExists(packagedPlugin, exists)) return joinForPlatform(platform, packagedPlugin, 'bin')

  const packaged = resolvePackagedMovScriptCliPackageBinDir(input)
  if (packaged && movscriptCliBuiltPackageExists(dirname(packaged), exists)) return packaged

  const repo = resolveMovScriptRepoRoot(input)
  const devPlugin = resolveForPlatform(joinForPlatform(platform, repo, 'apps/plugin'), platform)
  if (movscriptCliPluginPackageExists(devPlugin, exists)) return joinForPlatform(platform, devPlugin, 'bin')
  const dev = resolveForPlatform(joinForPlatform(platform, repo, 'apps/cli/bin'), platform)
  return movscriptCliBuiltPackageExists(dirname(dev), exists) ? dev : undefined
}

export function ensureWorkspaceMovScriptCliBin(input: MovScriptCliPathInput = {}): string | undefined {
  const platform = input.platform ?? process.platform
  const workspace = resolveWorkspaceMovScriptCliBinDir(input)
  if (!workspace) return undefined

  const source = workspaceMovScriptCliSourceCandidates(input).find((candidate) => movscriptCliPackageSourceExists(candidate, existsSync))
  if (!source) {
    return movscriptCliBinExists(workspace, input.exists ?? existsSync, platform) ? workspace : undefined
  }

  mkdirSync(workspace, { recursive: true })
  writeWorkspaceMovScriptCliShim(workspace, source, platform)
  return workspace
}

export function movScriptCliPathEnv(input: {
  env?: NodeJS.ProcessEnv
  cliBinDir?: string
  platform?: NodeJS.Platform
  isPackaged?: boolean
  isElectronRuntime?: boolean
}): NodeJS.ProcessEnv {
  const env = input.env ?? process.env
  const cliBinDir = input.cliBinDir
  const platform = input.platform ?? process.platform
  const runtimeEnv = movScriptCliRuntimeEnv(input)
  if (!cliBinDir) return { ...env, ...runtimeEnv }
  const pathKey = pathEnvKey(env, platform)
  const currentPath = env[pathKey] ?? ''
  return {
    ...env,
    ...runtimeEnv,
    MOVSCRIPT_CLI_BIN_DIR: cliBinDir,
    [pathKey]: prependPath(cliBinDir, currentPath, platform),
  }
}

export function movScriptCliRuntimeEnv(input: {
  isPackaged?: boolean
  isElectronRuntime?: boolean
} = {}): NodeJS.ProcessEnv {
  const executablePath = process.execPath
  if (!executablePath) return {}
  const electronRuntime = input.isElectronRuntime ?? isElectronRuntime()
  const packaged = input.isPackaged ?? isElectronPackaged()
  return electronRuntime || packaged
    ? { MOVSCRIPT_ELECTRON_BIN: executablePath }
    : { MOVSCRIPT_NODE_BIN: executablePath }
}

export function prependPath(
  dir: string,
  currentPath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const pathDelimiter = pathDelimiterForPlatform(platform)
  const entries = currentPath.split(pathDelimiter).filter(Boolean)
  const normalized = resolveForPlatform(dir, platform)
  const withoutDuplicate = entries.filter((entry) => resolveForPlatform(entry, platform) !== normalized)
  return [normalized, ...withoutDuplicate].join(pathDelimiter)
}

export function pathEnvKey(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string {
  if (platform !== 'win32') return 'PATH'
  return Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'Path'
}

function pathDelimiterForPlatform(platform: NodeJS.Platform): string {
  return platform === 'win32' ? ';' : ':'
}

function resolveMovScriptRepoRoot(input: MovScriptCliPathInput): string {
  const cwd = input.cwd ?? process.cwd()
  const currentDir = input.dirname ?? moduleDir
  const candidates = [
    resolve(cwd, '../..'),
    resolve(currentDir, '../../..'),
    resolve(dirname(currentDir), '../../..'),
  ]
  return candidates.find((candidate) => (
    movscriptCliPluginPackageExists(join(candidate, 'apps/plugin'), input.exists ?? existsSync)
    || movscriptCliSourceBinExists(join(candidate, 'apps/cli/bin'), input.exists ?? existsSync)
  ))
    ?? candidates[0]!
}

function repoMovScriptCliPackageDir(input: MovScriptCliPathInput): string {
  return resolve(resolveMovScriptRepoRoot(input), 'apps/cli')
}

function resolveWorkspaceMovScriptCliBinDir(input: MovScriptCliPathInput): string | undefined {
  const workspaceDir = input.workspaceDir?.trim()
  return workspaceDir ? resolveMovScriptWorkspaceRootPaths(workspaceDir).binDir : undefined
}

function resolvePackagedMovScriptCliPackageBinDir(input: MovScriptCliPathInput): string | undefined {
  if (input.resourcesPath) return resolve(input.resourcesPath, 'movscript-cli/bin')
  const packaged = input.isPackaged ?? isElectronPackaged()
  if (!packaged || !process.resourcesPath) return undefined
  return resolve(process.resourcesPath, 'movscript-cli/bin')
}

function resolvePackagedMovScriptPluginDir(input: MovScriptCliPathInput): string | undefined {
  if (input.resourcesPath) return resolve(input.resourcesPath, 'provider-plugins/movscript')
  const packaged = input.isPackaged ?? isElectronPackaged()
  if (!packaged || !process.resourcesPath) return undefined
  return resolve(process.resourcesPath, 'provider-plugins/movscript')
}

function movscriptCliCommandName(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'movscript.cmd' : 'movscript'
}

function movscriptCliBinExists(binDir: string, exists: (path: string) => boolean, platform: NodeJS.Platform): boolean {
  return exists(joinForPlatform(platform, binDir, movscriptCliCommandName(platform)))
}

function movscriptCliSourceBinExists(binDir: string, exists: (path: string) => boolean): boolean {
  return exists(join(binDir, 'movscript'))
}

function movscriptCliBuiltPackageExists(packageDir: string, exists: (path: string) => boolean): boolean {
  return movscriptCliSourceBinExists(join(packageDir, 'bin'), exists) && exists(join(packageDir, 'dist/index.cjs'))
}

type MovScriptCliPackageSource = {
  kind: 'plugin' | 'legacy'
  packageDir: string
}

function movscriptCliPluginPackageExists(packageDir: string, exists: (path: string) => boolean): boolean {
  return exists(join(packageDir, 'bin', 'movscript')) && Boolean(movscriptPluginEntrypoint(packageDir, exists))
}

function movscriptPluginEntrypoint(packageDir: string, exists: (path: string) => boolean): string | undefined {
  const modernEntry = join(packageDir, 'bin', 'movscript.mjs')
  if (exists(modernEntry)) return modernEntry
  const legacyEntry = join(packageDir, 'bin', 'movscript-agent-mcp.mjs')
  if (exists(legacyEntry)) return legacyEntry
  return undefined
}

function movscriptCliPackageSourceExists(source: MovScriptCliPackageSource, exists: (path: string) => boolean): boolean {
  return source.kind === 'plugin'
    ? movscriptCliPluginPackageExists(source.packageDir, exists)
    : movscriptCliBuiltPackageExists(source.packageDir, exists)
}

function workspaceMovScriptCliSourceCandidates(input: MovScriptCliPathInput): MovScriptCliPackageSource[] {
  const repo = repoMovScriptCliPackageDir(input)
  return [
    pluginSource(resolvePackagedMovScriptPluginDir(input)),
    legacySource(resolvePackagedMovScriptCliPackageBinDir(input)),
    pluginSource(resolve(resolveMovScriptRepoRoot(input), 'apps/plugin')),
    legacySource(resolve(repo, '..', 'cli')),
  ].filter((candidate): candidate is MovScriptCliPackageSource => Boolean(candidate))
}

function pluginSource(packageDir: string | undefined): MovScriptCliPackageSource | undefined {
  return packageDir ? { kind: 'plugin', packageDir } : undefined
}

function legacySource(binDir: string | undefined): MovScriptCliPackageSource | undefined {
  return binDir ? { kind: 'legacy', packageDir: dirname(binDir) } : undefined
}

function writeWorkspaceMovScriptCliShim(binDir: string, source: MovScriptCliPackageSource, platform: NodeJS.Platform): void {
  writeFileSync(join(binDir, 'movscript.mjs'), source.kind === 'plugin'
    ? workspacePluginMovScriptCliEntry(source.packageDir)
    : workspaceLegacyMovScriptCliEntry(source.packageDir), 'utf8')
  if (platform === 'win32') {
    writeFileSync(join(binDir, 'movscript.cmd'), workspaceMovScriptCliCmd(), 'utf8')
    return
  }
  writeFileSync(join(binDir, 'movscript'), workspaceMovScriptCliShell(), 'utf8')
  chmodSync(join(binDir, 'movscript'), 0o755)
  chmodSync(join(binDir, 'movscript.mjs'), 0o755)
}

function workspaceLegacyMovScriptCliEntry(packageDir: string): string {
  const distEntry = resolve(packageDir, 'dist/index.cjs')
  return `#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const builtEntry = ${JSON.stringify(distEntry)}

if (!existsSync(builtEntry)) {
  console.error('movscript has not been built into the bundled MovScript CLI package.')
  process.exit(1)
}

await import(pathToFileURL(builtEntry).href)
`
}

function workspacePluginMovScriptCliEntry(packageDir: string): string {
  const modernEntry = resolve(packageDir, 'bin/movscript.mjs')
  const legacyEntry = resolve(packageDir, 'bin/movscript-agent-mcp.mjs')
  return `#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const modernEntry = ${JSON.stringify(modernEntry)}
const legacyEntry = ${JSON.stringify(legacyEntry)}
const pluginEntry = existsSync(modernEntry) ? modernEntry : existsSync(legacyEntry) ? legacyEntry : undefined

if (!pluginEntry) {
  console.error('MovScript plugin CLI entrypoint was not found.')
  process.exit(1)
}

process.argv = [process.argv[0] ?? 'node', pluginEntry, ...process.argv.slice(2)]
await import(pathToFileURL(pluginEntry).href)
`
}

function workspaceMovScriptCliShell(): string {
  return `#!/bin/sh
set -eu
script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)
if [ -n "\${MOVSCRIPT_NODE_BIN:-}" ]; then
  exec "$MOVSCRIPT_NODE_BIN" "$script_dir/movscript.mjs" "$@"
fi
if [ -n "\${MOVSCRIPT_ELECTRON_BIN:-}" ]; then
  ELECTRON_RUN_AS_NODE=1 exec "$MOVSCRIPT_ELECTRON_BIN" "$script_dir/movscript.mjs" "$@"
fi
exec node "$script_dir/movscript.mjs" "$@"
`
}

function workspaceMovScriptCliCmd(): string {
  return `@echo off
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
`
}

function resolveForPlatform(path: string, platform: NodeJS.Platform): string {
  return platform === 'win32' ? pathWin32.resolve(path) : resolve(path)
}

function joinForPlatform(platform: NodeJS.Platform, ...parts: string[]): string {
  return platform === 'win32' ? pathWin32.join(...parts) : join(...parts)
}

function isElectronPackaged(): boolean {
  try {
    const electron = require('electron') as { app?: { isPackaged?: boolean } }
    return electron.app?.isPackaged === true
  } catch {
    return false
  }
}

function isElectronRuntime(): boolean {
  return typeof (process.versions as NodeJS.ProcessVersions & { electron?: string }).electron === 'string'
}
