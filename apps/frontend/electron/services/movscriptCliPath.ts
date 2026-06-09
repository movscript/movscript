import { chmodSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { delimiter } from 'node:path'
import { dirname, join, resolve } from 'node:path'
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
  env?: NodeJS.ProcessEnv
  exists?: (path: string) => boolean
}

export function resolveMovScriptCliBinDir(input: MovScriptCliPathInput = {}): string | undefined {
  const env = input.env ?? process.env
  const exists = input.exists ?? existsSync
  const override = env.MOVSCRIPT_CLI_BIN_DIR?.trim()
  if (override && movcliBinExists(resolve(override), exists)) return resolve(override)

  const workspace = resolveWorkspaceMovScriptCliBinDir(input)
  if (workspace && movcliBinExists(workspace, exists)) return workspace

  const packaged = resolvePackagedMovScriptCliBinDir(input)
  if (packaged && movcliBuiltPackageExists(dirname(packaged), exists)) return packaged

  const repo = resolveMovScriptRepoRoot(input)
  const dev = resolve(repo, 'apps/cli/bin')
  return movcliBuiltPackageExists(dirname(dev), exists) ? dev : undefined
}

export function ensureWorkspaceMovScriptCliBin(input: MovScriptCliPathInput = {}): string | undefined {
  const workspace = resolveWorkspaceMovScriptCliBinDir(input)
  if (!workspace) return undefined

  const source = workspaceMovScriptCliSourceCandidates(input).find((candidate) => movcliBinExists(candidate, existsSync))
  if (!source) {
    return movcliBinExists(workspace, input.exists ?? existsSync) ? workspace : undefined
  }

  const packageDir = dirname(source)
  const distEntry = resolve(packageDir, 'dist/index.cjs')
  if (!existsSync(distEntry)) {
    return movcliBinExists(workspace, input.exists ?? existsSync) ? workspace : undefined
  }

  mkdirSync(workspace, { recursive: true })
  writeWorkspaceMovcliShim(workspace, packageDir)
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
  const runtimeEnv = movScriptCliRuntimeEnv(input)
  if (!cliBinDir) return { ...env, ...runtimeEnv }
  const pathKey = pathEnvKey(env, input.platform ?? process.platform)
  const currentPath = env[pathKey] ?? ''
  return {
    ...env,
    ...runtimeEnv,
    MOVSCRIPT_CLI_BIN_DIR: cliBinDir,
    [pathKey]: prependPath(cliBinDir, currentPath),
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

export function prependPath(dir: string, currentPath: string): string {
  const entries = currentPath.split(delimiter).filter(Boolean)
  const normalized = resolve(dir)
  const withoutDuplicate = entries.filter((entry) => resolve(entry) !== normalized)
  return [normalized, ...withoutDuplicate].join(delimiter)
}

function pathEnvKey(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string {
  if (platform !== 'win32') return 'PATH'
  return Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'Path'
}

function resolveMovScriptRepoRoot(input: MovScriptCliPathInput): string {
  const cwd = input.cwd ?? process.cwd()
  const currentDir = input.dirname ?? moduleDir
  const candidates = [
    resolve(cwd, '../..'),
    resolve(currentDir, '../../..'),
    resolve(dirname(currentDir), '../../..'),
  ]
  return candidates.find((candidate) => movcliBinExists(join(candidate, 'apps/cli/bin'), input.exists ?? existsSync))
    ?? candidates[0]!
}

function repoMovScriptCliPackageDir(input: MovScriptCliPathInput): string {
  return resolve(resolveMovScriptRepoRoot(input), 'apps/cli')
}

function resolveWorkspaceMovScriptCliBinDir(input: MovScriptCliPathInput): string | undefined {
  const workspaceDir = input.workspaceDir?.trim()
  return workspaceDir ? join(resolveMovScriptWorkspaceRootPaths(workspaceDir).controlDir, 'bin') : undefined
}

function resolvePackagedMovScriptCliBinDir(input: MovScriptCliPathInput): string | undefined {
  if (input.resourcesPath) return resolve(input.resourcesPath, 'movcli/bin')
  const packaged = input.isPackaged ?? isElectronPackaged()
  if (!packaged || !process.resourcesPath) return undefined
  return resolve(process.resourcesPath, 'movcli/bin')
}

function movcliBinExists(binDir: string, exists: (path: string) => boolean): boolean {
  return exists(join(binDir, 'movcli'))
}

function movcliBuiltPackageExists(packageDir: string, exists: (path: string) => boolean): boolean {
  return movcliBinExists(join(packageDir, 'bin'), exists) && exists(join(packageDir, 'dist/index.cjs'))
}

function workspaceMovScriptCliSourceCandidates(input: MovScriptCliPathInput): string[] {
  return [
    resolvePackagedMovScriptCliBinDir(input),
    resolve(repoMovScriptCliPackageDir(input), 'bin'),
  ].filter((candidate): candidate is string => typeof candidate === 'string')
}

function writeWorkspaceMovcliShim(binDir: string, packageDir: string): void {
  const sourceBinDir = join(packageDir, 'bin')
  copyFileSync(join(sourceBinDir, 'movcli'), join(binDir, 'movcli'))
  writeFileSync(join(binDir, 'movcli.mjs'), workspaceMovcliEntry(packageDir), 'utf8')
  if (process.platform !== 'win32') chmodSync(join(binDir, 'movcli'), 0o755)
  if (process.platform !== 'win32') chmodSync(join(binDir, 'movcli.mjs'), 0o755)
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
