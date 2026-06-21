import { chmodSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve, win32 as pathWin32 } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveMovScriptWorkspaceRootPaths } from '@movscript/core/workspace/node'

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
  const override = env.MOVSCRIPT_CLI_BIN_DIR?.trim()
  const overrideDir = override ? resolveForPlatform(override, platform) : undefined
  if (overrideDir && movcliBinExists(overrideDir, exists, platform)) return overrideDir

  const workspace = resolveWorkspaceMovScriptCliBinDir(input)
  if (workspace && movcliBinExists(workspace, exists, platform)) return workspace

  const packaged = resolvePackagedMovScriptCliBinDir(input)
  if (packaged && movcliBuiltPackageExists(dirname(packaged), exists)) return packaged

  const repo = resolveMovScriptRepoRoot(input)
  const dev = resolveForPlatform(joinForPlatform(platform, repo, 'apps/cli/bin'), platform)
  return movcliBuiltPackageExists(dirname(dev), exists) ? dev : undefined
}

export function ensureWorkspaceMovScriptCliBin(input: MovScriptCliPathInput = {}): string | undefined {
  const platform = input.platform ?? process.platform
  const workspace = resolveWorkspaceMovScriptCliBinDir(input)
  if (!workspace) return undefined

  const source = workspaceMovScriptCliSourceCandidates(input).find((candidate) => movcliSourceBinExists(candidate, existsSync))
  if (!source) {
    return movcliBinExists(workspace, input.exists ?? existsSync, platform) ? workspace : undefined
  }

  const packageDir = dirname(source)
  const distEntry = resolve(packageDir, 'dist/index.cjs')
  if (!existsSync(distEntry)) {
    return movcliBinExists(workspace, input.exists ?? existsSync, platform) ? workspace : undefined
  }

  mkdirSync(workspace, { recursive: true })
  writeWorkspaceMovcliShim(workspace, packageDir, platform)
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
  return candidates.find((candidate) => movcliSourceBinExists(join(candidate, 'apps/cli/bin'), input.exists ?? existsSync))
    ?? candidates[0]!
}

function repoMovScriptCliPackageDir(input: MovScriptCliPathInput): string {
  return resolve(resolveMovScriptRepoRoot(input), 'apps/cli')
}

function resolveWorkspaceMovScriptCliBinDir(input: MovScriptCliPathInput): string | undefined {
  const workspaceDir = input.workspaceDir?.trim()
  return workspaceDir ? resolveMovScriptWorkspaceRootPaths(workspaceDir).binDir : undefined
}

function resolvePackagedMovScriptCliBinDir(input: MovScriptCliPathInput): string | undefined {
  if (input.resourcesPath) return resolve(input.resourcesPath, 'movcli/bin')
  const packaged = input.isPackaged ?? isElectronPackaged()
  if (!packaged || !process.resourcesPath) return undefined
  return resolve(process.resourcesPath, 'movcli/bin')
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

function workspaceMovScriptCliSourceCandidates(input: MovScriptCliPathInput): string[] {
  return [
    resolvePackagedMovScriptCliBinDir(input),
    resolve(repoMovScriptCliPackageDir(input), 'bin'),
  ].filter((candidate): candidate is string => typeof candidate === 'string')
}

function writeWorkspaceMovcliShim(binDir: string, packageDir: string, platform: NodeJS.Platform): void {
  const sourceBinDir = join(packageDir, 'bin')
  writeFileSync(join(binDir, 'movcli.mjs'), workspaceMovcliEntry(packageDir), 'utf8')
  if (platform === 'win32') {
    writeFileSync(join(binDir, 'movcli.cmd'), workspaceMovcliCmd(), 'utf8')
    return
  }
  copyFileSync(join(sourceBinDir, 'movcli'), join(binDir, 'movcli'))
  chmodSync(join(binDir, 'movcli'), 0o755)
  chmodSync(join(binDir, 'movcli.mjs'), 0o755)
}

function workspaceMovcliEntry(packageDir: string): string {
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
