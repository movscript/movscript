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
  if (input.workspaceDir?.trim() && workspace && movcliBinExists(workspace, exists, platform)) return workspace

  const override = env.MOVSCRIPT_CLI_BIN_DIR?.trim()
  const overrideDir = override ? resolveForPlatform(override, platform) : undefined
  if (overrideDir && movcliBinExists(overrideDir, exists, platform)) return overrideDir

  if (workspace && movcliBinExists(workspace, exists, platform)) return workspace

  const packagedPlugin = resolvePackagedMovScriptPluginDir(input)
  if (packagedPlugin && movcliPluginPackageExists(packagedPlugin, exists)) return joinForPlatform(platform, packagedPlugin, 'bin')

  const packaged = resolvePackagedLegacyMovcliBinDir(input)
  if (packaged && movcliBuiltPackageExists(dirname(packaged), exists)) return packaged

  const repo = resolveMovScriptRepoRoot(input)
  const devPlugin = resolveForPlatform(joinForPlatform(platform, repo, 'apps/plugin'), platform)
  if (movcliPluginPackageExists(devPlugin, exists)) return joinForPlatform(platform, devPlugin, 'bin')
  const dev = resolveForPlatform(joinForPlatform(platform, repo, 'apps/cli/bin'), platform)
  return movcliBuiltPackageExists(dirname(dev), exists) ? dev : undefined
}

export function ensureWorkspaceMovScriptCliBin(input: MovScriptCliPathInput = {}): string | undefined {
  const platform = input.platform ?? process.platform
  const workspace = resolveWorkspaceMovScriptCliBinDir(input)
  if (!workspace) return undefined

  const source = workspaceMovScriptCliSourceCandidates(input).find((candidate) => movcliPackageSourceExists(candidate, existsSync))
  if (!source) {
    return movcliBinExists(workspace, input.exists ?? existsSync, platform) ? workspace : undefined
  }

  mkdirSync(workspace, { recursive: true })
  writeWorkspaceMovcliShim(workspace, source, platform)
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
    movcliPluginPackageExists(join(candidate, 'apps/plugin'), input.exists ?? existsSync)
    || movcliSourceBinExists(join(candidate, 'apps/cli/bin'), input.exists ?? existsSync)
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

function resolvePackagedLegacyMovcliBinDir(input: MovScriptCliPathInput): string | undefined {
  if (input.resourcesPath) return resolve(input.resourcesPath, 'movcli/bin')
  const packaged = input.isPackaged ?? isElectronPackaged()
  if (!packaged || !process.resourcesPath) return undefined
  return resolve(process.resourcesPath, 'movcli/bin')
}

function resolvePackagedMovScriptPluginDir(input: MovScriptCliPathInput): string | undefined {
  if (input.resourcesPath) return resolve(input.resourcesPath, 'provider-plugins/movscript')
  const packaged = input.isPackaged ?? isElectronPackaged()
  if (!packaged || !process.resourcesPath) return undefined
  return resolve(process.resourcesPath, 'provider-plugins/movscript')
}

function movcliCommandName(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'movcli.cmd' : 'movcli'
}

function movcliBinExists(binDir: string, exists: (path: string) => boolean, platform: NodeJS.Platform): boolean {
  return exists(joinForPlatform(platform, binDir, movcliCommandName(platform)))
}

function movcliSourceBinExists(binDir: string, exists: (path: string) => boolean): boolean {
  return exists(join(binDir, 'movcli'))
}

function movcliBuiltPackageExists(packageDir: string, exists: (path: string) => boolean): boolean {
  return movcliSourceBinExists(join(packageDir, 'bin'), exists) && exists(join(packageDir, 'dist/index.cjs'))
}

type MovcliPackageSource = {
  kind: 'plugin' | 'legacy'
  packageDir: string
}

function movcliPluginPackageExists(packageDir: string, exists: (path: string) => boolean): boolean {
  return exists(join(packageDir, 'bin', 'movcli')) && exists(join(packageDir, 'bin', 'movscript-agent-mcp.mjs'))
}

function movcliPackageSourceExists(source: MovcliPackageSource, exists: (path: string) => boolean): boolean {
  return source.kind === 'plugin'
    ? movcliPluginPackageExists(source.packageDir, exists)
    : movcliBuiltPackageExists(source.packageDir, exists)
}

function workspaceMovScriptCliSourceCandidates(input: MovScriptCliPathInput): MovcliPackageSource[] {
  const repo = repoMovScriptCliPackageDir(input)
  return [
    pluginSource(resolvePackagedMovScriptPluginDir(input)),
    legacySource(resolvePackagedLegacyMovcliBinDir(input)),
    pluginSource(resolve(resolveMovScriptRepoRoot(input), 'apps/plugin')),
    legacySource(resolve(repo, '..', 'cli')),
  ].filter((candidate): candidate is MovcliPackageSource => Boolean(candidate))
}

function pluginSource(packageDir: string | undefined): MovcliPackageSource | undefined {
  return packageDir ? { kind: 'plugin', packageDir } : undefined
}

function legacySource(binDir: string | undefined): MovcliPackageSource | undefined {
  return binDir ? { kind: 'legacy', packageDir: dirname(binDir) } : undefined
}

function writeWorkspaceMovcliShim(binDir: string, source: MovcliPackageSource, platform: NodeJS.Platform): void {
  writeFileSync(join(binDir, 'movcli.mjs'), source.kind === 'plugin'
    ? workspacePluginMovcliEntry(source.packageDir)
    : workspaceLegacyMovcliEntry(source.packageDir), 'utf8')
  if (platform === 'win32') {
    writeFileSync(join(binDir, 'movcli.cmd'), workspaceMovcliCmd(), 'utf8')
    return
  }
  writeFileSync(join(binDir, 'movcli'), workspaceMovcliShell(), 'utf8')
  chmodSync(join(binDir, 'movcli'), 0o755)
  chmodSync(join(binDir, 'movcli.mjs'), 0o755)
}

function workspaceLegacyMovcliEntry(packageDir: string): string {
  const distEntry = resolve(packageDir, 'dist/index.cjs')
  return `#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const builtEntry = ${JSON.stringify(distEntry)}

if (!existsSync(builtEntry)) {
  console.error('movcli has not been built into the bundled MovScript CLI package.')
  process.exit(1)
}

await import(pathToFileURL(builtEntry).href)
`
}

function workspacePluginMovcliEntry(packageDir: string): string {
  const agentMCPEntry = resolve(packageDir, 'bin/movscript-agent-mcp.mjs')
  return `#!/usr/bin/env node

import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const agentMCPEntry = ${JSON.stringify(agentMCPEntry)}

if (!existsSync(agentMCPEntry)) {
  console.error('MovScript plugin CLI entrypoint was not found.')
  process.exit(1)
}

process.argv = [process.argv[0] ?? 'node', agentMCPEntry, '__movscript_movcli', ...process.argv.slice(2)]
await import(pathToFileURL(agentMCPEntry).href)
`
}

function workspaceMovcliShell(): string {
  return `#!/bin/sh
set -eu
script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)
if [ -n "\${MOVSCRIPT_NODE_BIN:-}" ]; then
  exec "$MOVSCRIPT_NODE_BIN" "$script_dir/movcli.mjs" "$@"
fi
if [ -n "\${MOVSCRIPT_ELECTRON_BIN:-}" ]; then
  ELECTRON_RUN_AS_NODE=1 exec "$MOVSCRIPT_ELECTRON_BIN" "$script_dir/movcli.mjs" "$@"
fi
exec node "$script_dir/movcli.mjs" "$@"
`
}

function workspaceMovcliCmd(): string {
  return `@echo off
setlocal
set "ENTRY=%~dp0movcli.mjs"
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
