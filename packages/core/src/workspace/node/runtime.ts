import { accessSync, constants, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { resolveMovScriptWorkspaceRootPaths } from './paths.js'

export const MOVSCRIPT_SERVER_BINARY_BASENAME = 'movscript-server'
export const MOVSCRIPT_CLI_BINARY_BASENAME = 'movcli'
export const MOVSCRIPT_CLI_SHIM_BASENAME = 'movcli.mjs'

export type MovScriptRuntimeDependencySeverity = 'fatal' | 'warning' | 'optional'
export type MovScriptRuntimeDependencyStatus = 'ok' | 'missing' | 'invalid'

export interface MovScriptRuntimeDependencyCheck {
  id: string
  label: string
  severity: MovScriptRuntimeDependencySeverity
  status: MovScriptRuntimeDependencyStatus
  path?: string
  message?: string
}

export interface MovScriptRuntimePreflightResult {
  ok: boolean
  fatalCount: number
  checks: MovScriptRuntimeDependencyCheck[]
}

export interface MovScriptWorkspaceRuntimePaths {
  workspaceDir: string
  controlDir: string
  configTomlPath: string
  binDir: string
  movscriptServerPath: string
  movcliPath: string
  movcliShimPath: string
}

export interface MovScriptRuntimePreflightInput {
  workspaceDir?: string
  platform?: NodeJS.Platform
  requireMovScriptServer?: boolean
  requireMovcli?: boolean
  exists?: (path: string) => boolean
  statFile?: (path: string) => MovScriptRuntimeStatLike
  canExecute?: (path: string) => boolean
}

export interface MovScriptRuntimeStatLike {
  isFile?: () => boolean
  isDirectory?: () => boolean
}

export function movScriptRuntimeBinaryName(baseName: string, platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? `${baseName}.exe` : baseName
}

export function resolveMovScriptWorkspaceRuntimePaths(input: {
  workspaceDir?: string
  platform?: NodeJS.Platform
} = {}): MovScriptWorkspaceRuntimePaths {
  const root = resolveMovScriptWorkspaceRootPaths(input.workspaceDir)
  const platform = input.platform ?? process.platform
  return {
    workspaceDir: root.workspaceDir,
    controlDir: root.controlDir,
    configTomlPath: root.configTomlPath,
    binDir: root.binDir,
    movscriptServerPath: join(root.binDir, movScriptRuntimeBinaryName(MOVSCRIPT_SERVER_BINARY_BASENAME, platform)),
    movcliPath: join(root.binDir, movScriptRuntimeBinaryName(MOVSCRIPT_CLI_BINARY_BASENAME, platform)),
    movcliShimPath: join(root.binDir, MOVSCRIPT_CLI_SHIM_BASENAME),
  }
}

export function movScriptRuntimePreflight(input: MovScriptRuntimePreflightInput = {}): MovScriptRuntimePreflightResult {
  const paths = resolveMovScriptWorkspaceRuntimePaths(input)
  const exists = input.exists ?? existsSync
  const statFile = input.statFile ?? statSync
  const canExecute = input.canExecute ?? defaultCanExecute
  const checks: MovScriptRuntimeDependencyCheck[] = []

  checks.push(directoryCheck({
    id: 'workspace.homeDir',
    label: 'MovScript home directory',
    path: paths.controlDir,
    exists,
    statFile,
  }))
  checks.push(fileCheck({
    id: 'workspace.configToml',
    label: 'MovScript startup config',
    path: paths.configTomlPath,
    exists,
    statFile,
  }))
  checks.push(directoryCheck({
    id: 'workspace.binDir',
    label: 'MovScript workspace binary directory',
    path: paths.binDir,
    exists,
    statFile,
  }))

  if (input.requireMovScriptServer !== false) {
    checks.push(executableCheck({
      id: 'runtime.movscriptServer',
      label: 'MovScript local backend',
      path: paths.movscriptServerPath,
      platform: input.platform ?? process.platform,
      exists,
      statFile,
      canExecute,
    }))
  }

  if (input.requireMovcli !== false) {
    checks.push(executableCheck({
      id: 'runtime.movcli',
      label: 'MovScript CLI',
      path: paths.movcliPath,
      platform: input.platform ?? process.platform,
      exists,
      statFile,
      canExecute,
    }))
    checks.push(fileCheck({
      id: 'runtime.movcliShim',
      label: 'MovScript CLI shim',
      path: paths.movcliShimPath,
      exists,
      statFile,
    }))
  }

  const fatalCount = checks.filter((check) => check.severity === 'fatal' && check.status !== 'ok').length
  return {
    ok: fatalCount === 0,
    fatalCount,
    checks,
  }
}

function directoryCheck(input: {
  id: string
  label: string
  path: string
  exists: (path: string) => boolean
  statFile: (path: string) => MovScriptRuntimeStatLike
}): MovScriptRuntimeDependencyCheck {
  if (!input.exists(input.path)) {
    return missingCheck(input, 'directory is missing')
  }
  try {
    const stat = input.statFile(input.path)
    if (typeof stat.isDirectory === 'function' && !stat.isDirectory()) {
      return invalidCheck(input, 'path is not a directory')
    }
    return okCheck(input)
  } catch (error) {
    return invalidCheck(input, errorMessage(error))
  }
}

function fileCheck(input: {
  id: string
  label: string
  path: string
  exists: (path: string) => boolean
  statFile: (path: string) => MovScriptRuntimeStatLike
}): MovScriptRuntimeDependencyCheck {
  if (!input.exists(input.path)) {
    return missingCheck(input, 'file is missing')
  }
  try {
    const stat = input.statFile(input.path)
    if (typeof stat.isFile === 'function' && !stat.isFile()) {
      return invalidCheck(input, 'path is not a file')
    }
    return okCheck(input)
  } catch (error) {
    return invalidCheck(input, errorMessage(error))
  }
}

function executableCheck(input: {
  id: string
  label: string
  path: string
  platform: NodeJS.Platform
  exists: (path: string) => boolean
  statFile: (path: string) => MovScriptRuntimeStatLike
  canExecute: (path: string) => boolean
}): MovScriptRuntimeDependencyCheck {
  const file = fileCheck(input)
  if (file.status !== 'ok') return file
  if (input.platform !== 'win32' && !input.canExecute(input.path)) {
    return invalidCheck(input, 'file is not executable')
  }
  return file
}

function okCheck(input: { id: string; label: string; path: string }): MovScriptRuntimeDependencyCheck {
  return {
    id: input.id,
    label: input.label,
    severity: 'fatal',
    status: 'ok',
    path: input.path,
  }
}

function missingCheck(input: { id: string; label: string; path: string }, message: string): MovScriptRuntimeDependencyCheck {
  return {
    id: input.id,
    label: input.label,
    severity: 'fatal',
    status: 'missing',
    path: input.path,
    message,
  }
}

function invalidCheck(input: { id: string; label: string; path: string }, message: string): MovScriptRuntimeDependencyCheck {
  return {
    id: input.id,
    label: input.label,
    severity: 'fatal',
    status: 'invalid',
    path: input.path,
    message,
  }
}

function defaultCanExecute(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
