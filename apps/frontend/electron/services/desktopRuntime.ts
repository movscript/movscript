import * as electron from 'electron'
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
} from '@movscript/core/workspace/node'
import { ensureWorkspaceMovScriptCliBin } from './movscriptCliPath'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from './movscriptWorkspaceDefaults'

export interface DesktopRuntimePreparation {
  workspaceDir: string
  movscriptServerPath?: string
  movcliBinDir?: string
  preflight: MovScriptRuntimePreflightResult
}

export function prepareDesktopRuntimeDependencies(input: {
  workspaceDir?: string
  resourcesPath?: string
  requireMovScriptServer?: boolean
  requireMovcli?: boolean
} = {}): DesktopRuntimePreparation {
  const workspaceDir = input.workspaceDir?.trim() || resolveDesktopDefaultMovScriptWorkspaceDir()
  const resourcesPath = input.resourcesPath ?? process.resourcesPath
  const root = resolveMovScriptWorkspaceRootPaths(workspaceDir)
  ensureMovScriptWorkspaceRoot(root)
  ensureMovScriptHomeConfig(root.configTomlPath)

  const movcliBinDir = input.requireMovcli === false
    ? undefined
    : ensureWorkspaceMovScriptCliBin({ workspaceDir, resourcesPath })

  const movscriptServerPath = input.requireMovScriptServer === false
    ? undefined
    : materializeWorkspaceMovScriptServer({ workspaceDir, resourcesPath })

  const preflight = movScriptRuntimePreflight({
    workspaceDir,
    requireMovScriptServer: input.requireMovScriptServer,
    requireMovcli: input.requireMovcli,
  })

  if (movscriptServerPath) process.env.MOVSCRIPT_BACKEND_BIN = movscriptServerPath
  if (movcliBinDir) process.env.MOVSCRIPT_CLI_BIN_DIR = movcliBinDir
  process.env.MOVSCRIPT_HOME ||= workspaceDir
  process.env.MOVSCRIPT_WORKSPACE_DIR ||= workspaceDir

  return {
    workspaceDir,
    ...(movscriptServerPath ? { movscriptServerPath } : {}),
    ...(movcliBinDir ? { movcliBinDir } : {}),
    preflight,
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
  if ((input.platform ?? process.platform) !== 'win32') chmodSync(runtimePaths.movscriptServerPath, 0o755)
  return runtimePaths.movscriptServerPath
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
      resolve(process.cwd(), '../backend/bin', binary),
      resolve(process.cwd(), '../backend/bin', legacyBinary),
      resolve(process.cwd(), '../../apps/backend/bin', binary),
      resolve(process.cwd(), '../../apps/backend/bin', legacyBinary),
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
