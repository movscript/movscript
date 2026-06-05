import { spawn, type ChildProcess } from 'node:child_process'
import { createRequire } from 'node:module'
import { isAbsolute, relative, resolve } from 'node:path'
import { createServer } from 'node:net'
import { fallbackUserAgentWorkspaceDir, resolveDefaultAgentWorkspaceDir } from '@movscript/agent-runtime'
import {
  distributeCodexConfigFromMovScriptWorkspace,
  type CodexConfigDistribution,
} from './codexConfigDistribution'
import {
  codexAppServerAccountMissingStatus,
  codexAppServerLaunchCanReuse,
  codexAppServerLaunchEnv,
  codexAppServerLaunchIdentity,
  codexAppServerPreflightFromDistribution,
  codexConfigStatusFromDistribution,
  type CodexAppServerLaunchIdentity,
} from './codexAppServerLaunch'
import {
  ensureMovScriptBundledCodexPlugin,
  type CodexBundledPluginBootstrap,
} from './codexBundledPluginBootstrap'
import type {
  ElectronCodexAppServerEnsureInput,
  ElectronCodexAppServerStatus,
} from '../../src/shared/contracts/electronApi'

const DEFAULT_MANAGED_CODEX_HOME_PATH = '.movscript/.codex'
const QUICK_EXIT_RESTART_COOLDOWN_MS = 8_000
const require = createRequire(import.meta.url)

type ManagedCodexAppServer = {
  profileId: string
  label?: string
  endpoint: string
  executablePath: string
  codexHome: string
  workspaceDir?: string
  configDistribution: CodexConfigDistribution
  bundledPlugin: CodexBundledPluginBootstrap
  child: ChildProcess
  startedAt: number
  lastError?: string
}

type RecentCodexAppServerExit = {
  profileId: string
  label?: string
  executablePath: string
  codexHome: string
  workspaceDir?: string
  configDistribution: CodexConfigDistribution
  bundledPlugin: CodexBundledPluginBootstrap
  identity: CodexAppServerLaunchIdentity
  exitedAt: number
  runtimeMs: number
  code: number | null
  signal: NodeJS.Signals | null
}

type PendingCodexAppServerEnsure = {
  identity: CodexAppServerLaunchIdentity
  promise: Promise<ElectronCodexAppServerStatus>
}

type CodexAppServerManagerDependencies = {
  distributeConfig: typeof distributeCodexConfigFromMovScriptWorkspace
  ensureBundledPlugin: typeof ensureMovScriptBundledCodexPlugin
  reservePort: () => Promise<number>
  waitReady: (endpoint: string) => Promise<void>
  spawnProcess: typeof spawn
  defaultWorkspaceDir: () => string
  now?: () => number
}

const defaultCodexAppServerManagerDependencies: CodexAppServerManagerDependencies = {
  distributeConfig: distributeCodexConfigFromMovScriptWorkspace,
  ensureBundledPlugin: ensureMovScriptBundledCodexPlugin,
  reservePort: reserveLocalPort,
  waitReady: waitForCodexAppServerReady,
  spawnProcess: spawn,
  defaultWorkspaceDir: resolveCodexDefaultWorkspaceDir,
}

export class CodexAppServerManager {
  private readonly managedServers = new Map<string, ManagedCodexAppServer>()
  private readonly pendingEnsures = new Map<string, PendingCodexAppServerEnsure>()
  private readonly recentExits = new Map<string, RecentCodexAppServerExit>()

  constructor(private readonly dependencies: CodexAppServerManagerDependencies = defaultCodexAppServerManagerDependencies) {}

  async ensure(input: ElectronCodexAppServerEnsureInput | undefined): Promise<ElectronCodexAppServerStatus> {
    const launch = this.resolveLaunch(input)
    if ('status' in launch) return launch.status

    const pending = this.pendingEnsures.get(launch.profileId)
    if (pending) {
      if (codexAppServerLaunchIdentityCanReuse(pending.identity, launch.identity)) return pending.promise
      await pending.promise.catch(() => undefined)
      return this.ensure(input)
    }

    const existing = this.managedServers.get(launch.profileId)
    if (existing && existing.child.exitCode === null && !existing.child.killed) {
      if (codexAppServerLaunchCanReuse(existing, launch.identity)) {
        existing.configDistribution = launch.configDistribution
        return this.status(launch.profileId)
      }
      existing.child.kill()
      this.managedServers.delete(launch.profileId)
    }

    const recentExit = this.recentExits.get(launch.profileId)
    if (recentExit && codexAppServerLaunchIdentityCanReuse(recentExit.identity, launch.identity)) {
      const elapsed = this.now() - recentExit.exitedAt
      if (elapsed < QUICK_EXIT_RESTART_COOLDOWN_MS) return codexAppServerRecentExitStatus(recentExit, QUICK_EXIT_RESTART_COOLDOWN_MS - elapsed)
      this.recentExits.delete(launch.profileId)
    }

    if (!launch.configDistribution.accountConfigured) {
      return codexAppServerAccountMissingStatus({
        profileId: launch.profileId,
        distribution: launch.configDistribution,
      })
    }

    const promise = this.start(launch).finally(() => {
      const current = this.pendingEnsures.get(launch.profileId)
      if (current?.promise === promise) this.pendingEnsures.delete(launch.profileId)
    })
    this.pendingEnsures.set(launch.profileId, {
      identity: launch.identity,
      promise,
    })
    return promise
  }

  status(profileId?: string): ElectronCodexAppServerStatus {
    const normalized = profileId?.trim()
    const server = normalized
      ? this.managedServers.get(normalized)
      : Array.from(this.managedServers.values()).find((item) => item.child.exitCode === null && !item.child.killed)
    if (!server) {
      const recentExit = normalized ? this.recentExits.get(normalized) : Array.from(this.recentExits.values())[0]
      if (recentExit) return codexAppServerRecentExitStatus(recentExit, Math.max(0, QUICK_EXIT_RESTART_COOLDOWN_MS - (this.now() - recentExit.exitedAt)))
      return codexAppServerError(normalized || 'codex', 'Codex app-server is not running')
    }
    const running = server.child.exitCode === null && !server.child.killed
    return {
      ok: running && !server.lastError,
      running,
      managed: true,
      profileId: server.profileId,
      ...(server.label ? { label: server.label } : {}),
      endpoint: server.endpoint,
      ...(server.child.pid ? { pid: server.child.pid } : {}),
      executablePath: server.executablePath,
      codexHome: server.codexHome,
      ...(server.workspaceDir ? { workspaceDir: server.workspaceDir } : {}),
      codexConfig: codexConfigStatusFromDistribution(server.configDistribution),
      preflight: codexAppServerPreflightFromDistribution(server.configDistribution),
      codexPlugin: server.bundledPlugin,
      ...(server.lastError ? { error: server.lastError } : {}),
    }
  }

  stop(profileId?: string): ElectronCodexAppServerStatus {
    const normalized = profileId?.trim()
    if (normalized) this.recentExits.delete(normalized)
    const server = normalized
      ? this.managedServers.get(normalized)
      : Array.from(this.managedServers.values()).find((item) => item.child.exitCode === null && !item.child.killed)
    if (!server) return codexAppServerError(normalized || 'codex', 'Codex app-server is not running')
    if (server.child.exitCode === null && !server.child.killed) server.child.kill()
    this.managedServers.delete(server.profileId)
    return {
      ok: true,
      running: false,
      managed: true,
      profileId: server.profileId,
      ...(server.label ? { label: server.label } : {}),
      endpoint: server.endpoint,
      executablePath: server.executablePath,
      codexHome: server.codexHome,
      ...(server.workspaceDir ? { workspaceDir: server.workspaceDir } : {}),
      codexConfig: codexConfigStatusFromDistribution(server.configDistribution),
      preflight: codexAppServerPreflightFromDistribution(server.configDistribution),
      codexPlugin: server.bundledPlugin,
    }
  }

  private async start(launch: ResolvedCodexAppServerLaunch): Promise<ElectronCodexAppServerStatus> {
    const port = await this.dependencies.reservePort()
    const endpoint = `ws://127.0.0.1:${port}`
    this.recentExits.delete(launch.profileId)
    const launchEnv = codexAppServerLaunchEnv({
      profileId: launch.profileId,
      configDistribution: launch.configDistribution,
    })
    console.info(`[codex:${launch.profileId}] launch env CODEX_HOME=${launchEnv.CODEX_HOME ?? ''}`)
    const child = this.dependencies.spawnProcess(launch.executablePath, ['app-server', '--listen', endpoint], {
      cwd: launch.workspaceDir,
      env: launchEnv,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const server: ManagedCodexAppServer = {
      profileId: launch.profileId,
      ...(launch.label ? { label: launch.label } : {}),
      endpoint,
      executablePath: launch.executablePath,
      codexHome: launch.codexHome,
      workspaceDir: launch.workspaceDir,
      configDistribution: launch.configDistribution,
      bundledPlugin: launch.bundledPlugin,
      child,
      startedAt: this.now(),
    }
    this.managedServers.set(launch.profileId, server)
    child.stdout?.on('data', (chunk) => console.info(`[codex:${launch.profileId}] ${String(chunk).trimEnd()}`))
    child.stderr?.on('data', (chunk) => console.info(`[codex:${launch.profileId}] ${String(chunk).trimEnd()}`))
    child.on('error', (error) => {
      server.lastError = error.message
      console.error(`[codex:${launch.profileId}] app-server spawn error`, error)
    })
    child.on('exit', (code, signal) => {
      server.lastError = code === 0 ? undefined : `Codex app-server exited code=${code ?? 'null'} signal=${signal ?? 'null'}`
      console.info(`[codex:${launch.profileId}] app-server exited code=${code ?? 'null'} signal=${signal ?? 'null'}`)
      const current = this.managedServers.get(launch.profileId)
      if (current?.child === child) this.managedServers.delete(launch.profileId)
      this.recentExits.set(launch.profileId, {
        profileId: launch.profileId,
        ...(launch.label ? { label: launch.label } : {}),
        executablePath: launch.executablePath,
        codexHome: launch.codexHome,
        workspaceDir: launch.workspaceDir,
        configDistribution: server.configDistribution,
        bundledPlugin: server.bundledPlugin,
        identity: launch.identity,
        exitedAt: this.now(),
        runtimeMs: Math.max(0, this.now() - server.startedAt),
        code,
        signal,
      })
    })

    try {
      await this.dependencies.waitReady(endpoint)
      return this.status(launch.profileId)
    } catch (error) {
      server.lastError = errorMessage(error)
      if (child.exitCode === null && !child.killed) child.kill()
      return this.status(launch.profileId)
    }
  }

  private resolveLaunch(input: ElectronCodexAppServerEnsureInput | undefined): ResolvedCodexAppServerLaunch | { status: ElectronCodexAppServerStatus } {
    const profile = input?.profile
    const profileId = profile?.id?.trim()
    if (!profileId) return { status: codexAppServerError('codex', 'Codex app-server profile id is required') }
    const label = profile?.label?.trim() || undefined
    const executablePath = profile?.executablePath?.trim() || process.env.MOVSCRIPT_CODEX_BIN?.trim() || 'codex'
    const workspaceDir = resolve(profile?.workspaceDir?.trim() || this.dependencies.defaultWorkspaceDir())
    const codexHome = resolveCodexHome(profile?.codexHome?.trim(), workspaceDir)
    const configDistribution = this.dependencies.distributeConfig({ workspaceDir, codexHome })
    if (!configDistribution.accountConfigured) {
      return {
        status: codexAppServerAccountMissingStatus({
          profileId,
          distribution: configDistribution,
        }),
      }
    }
    const bundledPlugin = this.dependencies.ensureBundledPlugin({ codexHome })
    if (!bundledPlugin.ok) {
      return {
        status: {
          ok: false,
          running: false,
          managed: true,
          profileId,
          ...(label ? { label } : {}),
          executablePath,
          codexHome,
          workspaceDir,
          codexConfig: codexConfigStatusFromDistribution(configDistribution),
          preflight: codexAppServerPreflightFromDistribution(configDistribution),
          codexPlugin: bundledPlugin,
          error: bundledPlugin.error ?? 'MovScript bundled Codex plugin bootstrap failed.',
        },
      }
    }
    const launchConfigDistribution = {
      ...configDistribution,
      hash: `${configDistribution.hash}:${bundledPlugin.hash}`,
    }
    const identity = codexAppServerLaunchIdentity({
      executablePath,
      codexHome,
      workspaceDir,
      configDistribution: launchConfigDistribution,
    })
    return {
      profileId,
      label,
      executablePath,
      workspaceDir,
      codexHome,
      configDistribution: launchConfigDistribution,
      bundledPlugin,
      identity,
    }
  }

  private now(): number {
    return this.dependencies.now?.() ?? Date.now()
  }
}

type ResolvedCodexAppServerLaunch = {
  profileId: string
  label?: string
  executablePath: string
  workspaceDir: string
  codexHome: string
  configDistribution: CodexConfigDistribution
  bundledPlugin: CodexBundledPluginBootstrap
  identity: CodexAppServerLaunchIdentity
}

export const codexAppServerManager = new CodexAppServerManager()

function codexAppServerError(profileId: string, error: string): ElectronCodexAppServerStatus {
  return {
    ok: false,
    running: false,
    managed: false,
    profileId,
    error,
  }
}

function codexAppServerRecentExitStatus(exit: RecentCodexAppServerExit, cooldownMs: number): ElectronCodexAppServerStatus {
  return {
    ok: false,
    running: false,
    managed: true,
    profileId: exit.profileId,
    ...(exit.label ? { label: exit.label } : {}),
    executablePath: exit.executablePath,
    codexHome: exit.codexHome,
    ...(exit.workspaceDir ? { workspaceDir: exit.workspaceDir } : {}),
    codexConfig: codexConfigStatusFromDistribution(exit.configDistribution),
    preflight: codexAppServerPreflightFromDistribution(exit.configDistribution),
    codexPlugin: exit.bundledPlugin,
    error: `Codex app-server exited code=${exit.code ?? 'null'} signal=${exit.signal ?? 'null'} after ${exit.runtimeMs}ms; restart cooldown ${Math.ceil(cooldownMs / 1000)}s.`,
  }
}

function resolveCodexHome(value: string | undefined, workspaceDir: string): string {
  const input = value?.trim() || DEFAULT_MANAGED_CODEX_HOME_PATH
  if (input === '~' || input.startsWith('~/') || isAbsolute(input)) {
    throw new Error(`Codex home must be a MovScript-managed relative workspace path: ${input}`)
  }
  if (!isMovScriptManagedCodexHome(input)) {
    throw new Error(`Codex home must be under .movscript/.codex: ${input}`)
  }
  const root = resolve(workspaceDir || process.cwd())
  const resolved = resolve(root, input)
  const relativeToWorkspace = relative(root, resolved)
  if (!relativeToWorkspace || relativeToWorkspace.startsWith('..') || isAbsolute(relativeToWorkspace)) {
    throw new Error(`Codex home must stay inside the MovScript workspace: ${input}`)
  }
  return resolved
}

function isMovScriptManagedCodexHome(value: string): boolean {
  return value === DEFAULT_MANAGED_CODEX_HOME_PATH
    || value.startsWith(`${DEFAULT_MANAGED_CODEX_HOME_PATH}/`)
}

function resolveCodexDefaultWorkspaceDir(): string {
  if (process.env.MOVSCRIPT_AGENT_WORKSPACE_DIR || process.env.MOVSCRIPT_WORKSPACE_DIR) {
    return resolveDefaultAgentWorkspaceDir()
  }
  try {
    const electron = require('electron') as { app?: { isPackaged?: boolean } }
    return electron.app?.isPackaged ? fallbackUserAgentWorkspaceDir() : process.cwd()
  } catch {
    return process.cwd()
  }
}

function codexAppServerLaunchIdentityCanReuse(
  existing: CodexAppServerLaunchIdentity,
  target: CodexAppServerLaunchIdentity,
): boolean {
  return existing.executablePath === target.executablePath
    && existing.codexHome === target.codexHome
    && existing.workspaceDir === target.workspaceDir
    && existing.configHash === target.configHash
}

async function reserveLocalPort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : undefined
      server.close(() => {
        if (typeof port === 'number') resolvePort(port)
        else reject(new Error('Failed to reserve local Codex app-server port'))
      })
    })
  })
}

async function waitForCodexAppServerReady(endpoint: string): Promise<void> {
  const healthURL = endpoint.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:')
  const readyURL = `${healthURL.replace(/\/+$/, '')}/readyz`
  const deadline = Date.now() + 10_000
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const response = await fetch(readyURL)
      if (response.ok) return
      lastError = new Error(`Codex app-server readiness returned ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 150))
  }
  throw new Error(`Timed out waiting for Codex app-server at ${readyURL}: ${errorMessage(lastError)}`)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
