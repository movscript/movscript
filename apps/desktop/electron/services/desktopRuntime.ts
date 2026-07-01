import * as electron from 'electron'
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import {
  ensureMovScriptWorkspaceRoot,
  ensureMovScriptHomeConfig,
  movScriptRuntimeBinaryName,
  movScriptRuntimePreflight,
  resolveMovScriptWorkspaceRootPaths,
  resolveMovScriptWorkspaceRuntimePaths,
  type MovScriptRuntimePreflightResult,
} from '@movscript/workspace/home'
import { ensureWorkspaceMovScriptCliBin } from './movscriptCliPath'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from './movscriptWorkspaceDefaults'

export interface DesktopRuntimePreparation {
  workspaceDir: string
  movscriptServerPath?: string
  movscriptCliBinDir?: string
  preflight: MovScriptRuntimePreflightResult
}

export function prepareDesktopRuntimeDependencies(input: {
  workspaceDir?: string
  resourcesPath?: string
  requireMovScriptServer?: boolean
  requireMovScriptCli?: boolean
  requireGit?: boolean
} = {}): DesktopRuntimePreparation {
  const workspaceDir = input.workspaceDir?.trim() || resolveDesktopDefaultMovScriptWorkspaceDir()
  const resourcesPath = input.resourcesPath ?? process.resourcesPath
  const root = resolveMovScriptWorkspaceRootPaths(workspaceDir)
  ensureMovScriptWorkspaceRoot(root)
  ensureMovScriptHomeConfig(root.configTomlPath)
  const requireMovScriptServer = input.requireMovScriptServer === true

  const movscriptCliBinDir = input.requireMovScriptCli === false
    ? undefined
    : ensureWorkspaceMovScriptCliBin({ workspaceDir, resourcesPath })

  const movscriptServerPath = requireMovScriptServer
    ? materializeWorkspaceMovScriptServer({ workspaceDir, resourcesPath })
    : undefined

  const preflight = withDesktopLocalGitPreflight(movScriptRuntimePreflight({
    workspaceDir,
    requireMovScriptServer,
    requireMovScriptCli: input.requireMovScriptCli,
  }), { ...input, requireMovScriptServer })

  if (movscriptServerPath) process.env.MOVSCRIPT_BACKEND_BIN = movscriptServerPath
  if (movscriptCliBinDir) process.env.MOVSCRIPT_CLI_BIN_DIR = movscriptCliBinDir
  process.env.MOVSCRIPT_HOME ||= workspaceDir
  process.env.MOVSCRIPT_WORKSPACE_DIR ||= workspaceDir

  return {
    workspaceDir,
    ...(movscriptServerPath ? { movscriptServerPath } : {}),
    ...(movscriptCliBinDir ? { movscriptCliBinDir } : {}),
    preflight,
  }
}

function withDesktopLocalGitPreflight(
  preflight: MovScriptRuntimePreflightResult,
  input: { requireGit?: boolean; requireMovScriptServer?: boolean },
): MovScriptRuntimePreflightResult {
  if (!shouldRequireLocalGit(input)) return preflight
  const check = gitRuntimeCheck(process.env.MOVSCRIPT_GIT_BINARY?.trim() || 'git')
  const checks = [...preflight.checks, check]
  const fatalCount = checks.filter((item) => item.severity === 'fatal' && item.status !== 'ok').length
  return { ok: fatalCount === 0, fatalCount, checks }
}

function shouldRequireLocalGit(input: { requireGit?: boolean; requireMovScriptServer?: boolean }): boolean {
  if (input.requireGit === true) return true
  if (input.requireGit === false || input.requireMovScriptServer === false) return false
  const profile = process.env.MOVSCRIPT_DEPENDENCY_PROFILE?.trim() || 'local'
  const workspaceBackend = process.env.MOVSCRIPT_WORKSPACE_STORAGE_BACKEND?.trim()
    || process.env.MOVSCRIPT_WORKSPACE_BACKEND?.trim()
    || (profile === 'external' ? 'gitea' : 'http')
  return normalizeWorkspaceBackend(workspaceBackend) === 'http'
}

function normalizeWorkspaceBackend(value: string): string {
  return value === 'git-http' || value === 'git-http-backend' ? 'http' : value
}

function gitRuntimeCheck(binary: string): MovScriptRuntimePreflightResult['checks'][number] {
  const result = spawnSync(binary, ['--version'], { stdio: 'ignore' })
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code
    return {
      id: 'runtime.git',
      label: 'Git command for local project storage',
      severity: 'fatal',
      status: code === 'ENOENT' ? 'missing' : 'invalid',
      path: binary,
      message: result.error.message,
    }
  }
  if (result.status !== 0) {
    return {
      id: 'runtime.git',
      label: 'Git command for local project storage',
      severity: 'fatal',
      status: 'invalid',
      path: binary,
      message: `git --version exited with ${result.status ?? 'unknown status'}`,
    }
  }
  return {
    id: 'runtime.git',
    label: 'Git command for local project storage',
    severity: 'fatal',
    status: 'ok',
    path: binary,
  }
}

export function formatDesktopRuntimePreflightFailure(preflight: MovScriptRuntimePreflightResult): string {
  const failures = preflight.checks.filter((check) => check.severity === 'fatal' && check.status !== 'ok')
  return failures.map((check) => {
    const path = check.path ? `\n  ${check.path}` : ''
    const message = check.message ? `: ${check.message}` : ''
    return `- ${check.label}${message}${path}`
  }).join('\n')
}

function materializeWorkspaceMovScriptServer(input: {
  workspaceDir: string
  resourcesPath?: string
  platform?: NodeJS.Platform
  arch?: string
}): string | undefined {
  const source = movScriptServerSourceCandidates(input)
    .find((candidate) => existsSync(candidate) && statSync(candidate).isFile())
  if (!source) return undefined

  const runtimePaths = resolveMovScriptWorkspaceRuntimePaths({
    workspaceDir: input.workspaceDir,
    platform: input.platform ?? process.platform,
  })
  mkdirSync(dirname(runtimePaths.movscriptServerPath), { recursive: true })
  if (shouldCopyBinary(source, runtimePaths.movscriptServerPath)) {
    copyFileSync(source, runtimePaths.movscriptServerPath)
  }
  const platform = input.platform ?? process.platform
  if (platform !== 'win32') chmodSync(runtimePaths.movscriptServerPath, 0o755)
  sanitizeMaterializedExecutable(runtimePaths.movscriptServerPath, platform)
  return runtimePaths.movscriptServerPath
}

function sanitizeMaterializedExecutable(path: string, platform: NodeJS.Platform): void {
  if (platform !== 'darwin') return
  for (const attribute of ['com.apple.quarantine', 'com.apple.provenance']) {
    spawnSync('xattr', ['-d', attribute, path], { stdio: 'ignore' })
  }
  spawnSync('codesign', ['--force', '--sign', '-', path], { stdio: 'ignore' })
}

function movScriptServerSourceCandidates(input: {
  workspaceDir: string
  resourcesPath?: string
  platform?: NodeJS.Platform
  arch?: string
}): string[] {
  const platform = input.platform ?? process.platform
  const arch = input.arch ?? process.arch
  const binary = movScriptRuntimeBinaryName('movscript-server', platform)
  const legacyBinary = platform === 'win32' ? 'server.exe' : 'server'
  const resourcesPath = input.resourcesPath
  const candidates = [
    process.env.MOVSCRIPT_BACKEND_BIN?.trim(),
    resourcesPath ? join(resourcesPath, 'movscript-server', platform, arch, binary) : undefined,
    resourcesPath ? join(resourcesPath, 'movscript-server', platform, binary) : undefined,
    resourcesPath ? join(resourcesPath, 'movscript-server', binary) : undefined,
    resourcesPath ? join(resourcesPath, 'backend', binary) : undefined,
    resourcesPath ? join(resourcesPath, 'backend', legacyBinary) : undefined,
  ]
  if (electron.app?.isPackaged !== true) {
    candidates.push(
      resolve(process.cwd(), '../../services/data-service/bin', binary),
      resolve(process.cwd(), '../../services/data-service/bin', legacyBinary),
    )
  }
  return candidates.filter((candidate): candidate is string => Boolean(candidate))
}

function shouldCopyBinary(source: string, target: string): boolean {
  if (!existsSync(target)) return true
  const sourceStat = statSync(source)
  const targetStat = statSync(target)
  return sourceStat.size !== targetStat.size || targetStat.mtimeMs < sourceStat.mtimeMs
}
