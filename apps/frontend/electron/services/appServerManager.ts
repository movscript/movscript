import { spawn, type ChildProcess } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { createServer } from 'node:net'
import {
  ensureMovScriptWorkspaceContext,
  resolveMovScriptWorkspaceContextPaths,
  resolveMovScriptWorkspaceRootPaths,
  type MovScriptWorkspaceContext,
} from '@movscript/core/workspace/node'
import {
  distributeAppServerConfigFromMovScriptWorkspace,
  type AppServerConfigDistribution,
} from './appServerConfigDistribution'
import {
  appServerAccountMissingStatus,
  appServerLaunchCanReuse,
  appServerLaunchEnv,
  appServerLaunchIdentity,
  appServerPreflightFromDistribution,
  appServerConfigStatusFromDistribution,
  type AppServerLaunchIdentity,
} from './appServerLaunch'
import {
  ensureMovScriptAppServerPlugin,
  type AppServerPluginBootstrap,
} from './appServerPluginBootstrap'
import { ensureWorkspaceMovScriptCliBin, movScriptCliPathEnv, resolveMovScriptCliBinDir } from './movscriptCliPath'
import { resolveDesktopDefaultMovScriptWorkspaceDir } from './movscriptWorkspaceDefaults'
import { upsertProviderSessionInWorkspace } from './providerSessionWorkspace'
import type {
  ElectronAppServerExecutableDiagnostic,
  ElectronAppServerEnsureInput,
  ElectronAppServerLogEvent,
  ElectronAppServerProfile,
  ElectronAppServerStatus,
} from '../../src/shared/contracts/electronApi'

const QUICK_EXIT_RESTART_COOLDOWN_MS = 8_000
const APP_SERVER_OUTPUT_EXCERPT_LIMIT = 2_048
const APP_SERVER_GRACEFUL_STOP_TIMEOUT_MS = 10_000
const DEFAULT_APP_SERVER_PROVIDER_KEY = 'mova'
type AppServerExecutableKind = 'cli' | 'app-server'
type AppServerProviderKey = NonNullable<ElectronAppServerProfile['providerKey']>
type AppServerLaunchTransport = 'stdio' | 'websocket'

type AppServerExecutableProfile = {
  providerKey: AppServerProviderKey
  command: string
  providerEnvVar: string
  legacyEnvVars?: string[]
  candidateRootRelativePaths?: string[]
  candidateBinaryNames?: string[]
  missingExecutableFound: boolean
  label: string
}

export type AppServerManagedRelaySocket = {
  send: (payload: string) => void
  close: () => void
  onMessage: (handler: (data: string) => void) => void
  onError: (handler: (error: Error) => void) => void
  onClose: (handler: () => void) => void
}

type ManagedAppServer = {
  profileId: string
  providerKey: AppServerProviderKey
  label?: string
  endpoint: string
  transport: AppServerLaunchTransport
  executablePath: string
  home: string
  rustLog?: string
  workspaceDir?: string
  workspaceContext?: MovScriptWorkspaceContext
  providerSessionCwd?: string
  cliBinDir?: string
  cliEnv?: Record<string, string>
  configDistribution: AppServerConfigDistribution
  pluginBootstrap: AppServerPluginBootstrap
  executableDiagnostic?: ElectronAppServerExecutableDiagnostic
  child: ChildProcess
  startedAt: number
  stdoutExcerpt?: string
  stderrExcerpt?: string
  lastError?: string
}

type AppServerLogListener = (event: ElectronAppServerLogEvent) => void

type RecentAppServerExit = {
  profileId: string
  providerKey: AppServerProviderKey
  label?: string
  endpoint: string
  transport: AppServerLaunchTransport
  executablePath: string
  home: string
  rustLog?: string
  workspaceDir?: string
  workspaceContext?: MovScriptWorkspaceContext
  providerSessionCwd?: string
  cliBinDir?: string
  cliEnv?: Record<string, string>
  configDistribution: AppServerConfigDistribution
  pluginBootstrap: AppServerPluginBootstrap
  executableDiagnostic?: ElectronAppServerExecutableDiagnostic
  identity: AppServerLaunchIdentity
  exitedAt: number
  runtimeMs: number
  code: number | null
  signal: NodeJS.Signals | null
  stdoutExcerpt?: string
  stderrExcerpt?: string
}

type PendingAppServerEnsure = {
  identity: AppServerLaunchIdentity
  promise: Promise<ElectronAppServerStatus>
}

type AppServerManagerDependencies = {
  distributeConfig: typeof distributeAppServerConfigFromMovScriptWorkspace
  ensurePlugin: typeof ensureMovScriptAppServerPlugin
  reservePort: () => Promise<number>
  waitReady: (endpoint: string) => Promise<void>
  spawnProcess: typeof spawn
  defaultWorkspaceDir: () => string
  launchTransport?: (launch: ResolvedAppServerLaunch) => AppServerLaunchTransport
  recordProviderSession?: typeof upsertProviderSessionInWorkspace
  resolveCliBinDir?: typeof resolveMovScriptCliBinDir
  ensureWorkspaceCliBin?: typeof ensureWorkspaceMovScriptCliBin
  resourcesPath?: () => string | undefined
  now?: () => number
}

export type AppServerExecutableResolutionInput = {
  provider?: AppServerProviderKey
  profile?: ElectronAppServerProfile
  cwd?: string
  sourceDir?: string
  managedBinDir?: string
  env?: NodeJS.ProcessEnv
  exists?: (path: string) => boolean
}

export type AppServerExecutableResolution = {
  executablePath: string
  found: boolean
  diagnostic?: ElectronAppServerExecutableDiagnostic
}

const defaultAppServerManagerDependencies: AppServerManagerDependencies = {
  distributeConfig: distributeAppServerConfigFromMovScriptWorkspace,
  ensurePlugin: ensureMovScriptAppServerPlugin,
  reservePort: reserveLocalPort,
  waitReady: waitForAppServerReady,
  spawnProcess: spawn,
  defaultWorkspaceDir: resolveAppServerDefaultWorkspaceDir,
  launchTransport: defaultAppServerLaunchTransport,
  recordProviderSession: upsertProviderSessionInWorkspace,
  resolveCliBinDir: resolveMovScriptCliBinDir,
  ensureWorkspaceCliBin: ensureWorkspaceMovScriptCliBin,
  resourcesPath: () => process.resourcesPath,
}

export class AppServerManager {
  private readonly managedServers = new Map<string, ManagedAppServer>()
  private readonly pendingEnsures = new Map<string, PendingAppServerEnsure>()
  private readonly recentExits = new Map<string, RecentAppServerExit>()
  private readonly stoppingProfiles = new Set<string>()
  private readonly logListeners = new Set<AppServerLogListener>()

  constructor(private readonly dependencies: AppServerManagerDependencies = defaultAppServerManagerDependencies) {}

  async ensure(input: ElectronAppServerEnsureInput | undefined): Promise<ElectronAppServerStatus> {
    const requestedProfileId = input?.profile?.id?.trim() || 'app-server'
    console.info(`[app-server:${requestedProfileId}] ensure requested`)
    const launch = this.resolveLaunch(input)
    if ('status' in launch) {
      logAppServerStatusDecision('ensure preflight failed', launch.status)
      return launch.status
    }
    console.info(`[app-server:${launch.profileId}] ensure resolved ${formatLaunchDiagnostic(launch)}`)

    const pending = this.pendingEnsures.get(launch.profileId)
    if (pending) {
      if (appServerLaunchIdentityCanReuse(pending.identity, launch.identity)) {
        console.info(`[app-server:${launch.profileId}] ensure reusing pending launch`)
        return pending.promise
      }
      console.info(`[app-server:${launch.profileId}] ensure waiting for stale pending launch before retry`)
      await pending.promise.catch(() => undefined)
      return this.ensure(input)
    }

    const existing = this.managedServers.get(launch.profileId)
    if (existing && existing.child.exitCode === null && !existing.child.killed) {
      if (appServerLaunchCanReuse(existing, launch.identity)) {
        existing.configDistribution = launch.configDistribution
        console.info(`[app-server:${launch.profileId}] ensure reusing running app-server endpoint=${existing.endpoint}`)
        return this.status(launch.profileId)
      }
      console.info(`[app-server:${launch.profileId}] ensure replacing running app-server because launch identity changed`)
      this.stoppingProfiles.add(existing.profileId)
      await this.stopChildProcess(existing)
      this.managedServers.delete(launch.profileId)
    }

    const recentExit = this.recentExits.get(launch.profileId)
    if (recentExit && appServerLaunchIdentityCanReuse(recentExit.identity, launch.identity)) {
      const elapsed = this.now() - recentExit.exitedAt
      if (elapsed < QUICK_EXIT_RESTART_COOLDOWN_MS) {
        const status = appServerRecentExitStatus(recentExit, QUICK_EXIT_RESTART_COOLDOWN_MS - elapsed)
        logAppServerStatusDecision('ensure blocked by quick-exit cooldown', status)
        return status
      }
      console.info(`[app-server:${launch.profileId}] ensure quick-exit cooldown expired; retrying launch`)
      this.recentExits.delete(launch.profileId)
    }

    if (!launch.configDistribution.accountConfigured) {
      const status = appServerAccountMissingStatus({
        profileId: launch.profileId,
        distribution: launch.configDistribution,
      })
      logAppServerStatusDecision('ensure blocked by missing account', status)
      return status
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

  distribute(input: ElectronAppServerEnsureInput | undefined): ElectronAppServerStatus {
    const launch = this.resolveLaunch(input, { bootstrapPlugin: false })
    if ('status' in launch) return launch.status
    const existing = this.managedServers.get(launch.profileId)
    if (existing && existing.child.exitCode === null && !existing.child.killed) {
      existing.configDistribution = launch.configDistribution
      const config = appServerConfigStatusFromDistribution(launch.configDistribution)
      return {
        ...this.status(launch.profileId),
        config,
        preflight: appServerPreflightFromDistribution(launch.configDistribution),
      }
    }
    const cliBinDir = this.resolveCliBinDir(launch.workspaceDir)
    const cliEnv = movScriptCliStatusEnv(movScriptCliPathEnv({ cliBinDir }))
    return {
      ok: launch.configDistribution.accountConfigured,
      running: false,
      managed: true,
      profileId: launch.profileId,
      ...(launch.label ? { label: launch.label } : {}),
      executablePath: launch.executablePath,
      home: launch.home,
      workspaceDir: launch.workspaceDir,
      workspaceContext: launch.workspaceContext,
      providerSessionCwd: launch.providerSessionCwd,
      ...(cliBinDir ? { cliBinDir } : {}),
      ...(Object.keys(cliEnv).length > 0 ? { cliEnv } : {}),
      config: appServerConfigStatusFromDistribution(launch.configDistribution),
      preflight: appServerPreflightFromDistribution(launch.configDistribution),
      ...(launch.executableDiagnostic ? { executableDiagnostic: launch.executableDiagnostic } : {}),
      ...(!launch.configDistribution.accountConfigured ? { error: 'app-server account is not configured in MovScript.' } : {}),
    }
  }

  status(profileId?: string): ElectronAppServerStatus {
    const normalized = profileId?.trim()
    const server = normalized
      ? this.managedServers.get(normalized)
      : Array.from(this.managedServers.values()).find((item) => item.child.exitCode === null && !item.child.killed)
    if (!server) {
      const recentExit = normalized ? this.recentExits.get(normalized) : Array.from(this.recentExits.values())[0]
      if (recentExit) {
        const status = appServerRecentExitStatus(recentExit, Math.max(0, QUICK_EXIT_RESTART_COOLDOWN_MS - (this.now() - recentExit.exitedAt)))
        logAppServerStatusDecision('status returning recent exit', status)
        return status
      }
      const status = appServerError(normalized || 'app-server', 'app-server is not running')
      logAppServerStatusDecision('status returning not running', status)
      return status
    }
    const running = server.child.exitCode === null && !server.child.killed
    const config = appServerConfigStatusFromDistribution(server.configDistribution)
    return {
      ok: running && !server.lastError,
      running,
      managed: true,
      profileId: server.profileId,
      ...(server.label ? { label: server.label } : {}),
      endpoint: server.endpoint,
      ...(server.child.pid ? { pid: server.child.pid } : {}),
      executablePath: server.executablePath,
      home: server.home,
      ...(server.rustLog ? { rustLog: server.rustLog } : {}),
      ...(server.workspaceDir ? { workspaceDir: server.workspaceDir } : {}),
      ...(server.workspaceContext ? { workspaceContext: server.workspaceContext } : {}),
      ...(server.providerSessionCwd ? { providerSessionCwd: server.providerSessionCwd } : {}),
      ...(server.cliBinDir ? { cliBinDir: server.cliBinDir } : {}),
      ...(server.cliEnv ? { cliEnv: server.cliEnv } : {}),
      config,
      preflight: appServerPreflightFromDistribution(server.configDistribution),
      plugin: server.pluginBootstrap,
      ...(server.executableDiagnostic ? { executableDiagnostic: server.executableDiagnostic } : {}),
      ...(server.lastError ? { error: server.lastError } : {}),
    }
  }

  async stop(profileId?: string): Promise<ElectronAppServerStatus> {
    const normalized = profileId?.trim()
    console.info(`[app-server:${normalized || 'app-server'}] stop requested`)
    if (normalized) this.recentExits.delete(normalized)
    const server = normalized
      ? this.managedServers.get(normalized)
      : Array.from(this.managedServers.values()).find((item) => item.child.exitCode === null && !item.child.killed)
    if (!server) {
      const status = appServerError(normalized || 'app-server', 'app-server is not running')
      logAppServerStatusDecision('stop ignored because not running', status)
      return status
    }
    this.stoppingProfiles.add(server.profileId)
    if (server.child.exitCode === null && !server.child.killed) {
      console.info(`[app-server:${server.profileId}] sending stop signal pid=${server.child.pid ?? 'unknown'} endpoint=${server.endpoint}`)
      await this.stopChildProcess(server)
    }
    this.managedServers.delete(server.profileId)
    this.recordProviderSession(server, 'stopped')
    const config = appServerConfigStatusFromDistribution(server.configDistribution)
    return {
      ok: true,
      running: false,
      managed: true,
      profileId: server.profileId,
      ...(server.label ? { label: server.label } : {}),
      endpoint: server.endpoint,
      executablePath: server.executablePath,
      home: server.home,
      ...(server.rustLog ? { rustLog: server.rustLog } : {}),
      ...(server.workspaceDir ? { workspaceDir: server.workspaceDir } : {}),
      ...(server.workspaceContext ? { workspaceContext: server.workspaceContext } : {}),
      ...(server.providerSessionCwd ? { providerSessionCwd: server.providerSessionCwd } : {}),
      config,
      preflight: appServerPreflightFromDistribution(server.configDistribution),
      plugin: server.pluginBootstrap,
      ...(server.executableDiagnostic ? { executableDiagnostic: server.executableDiagnostic } : {}),
    }
  }

  async stopAll(): Promise<void> {
    await Promise.all(Array.from(this.managedServers.keys()).map(async (profileId) => {
      try {
        await this.stop(profileId)
      } catch (error) {
        console.warn(`[app-server:${profileId}] failed to stop during shutdown`, error)
      }
    }))
  }

  onLog(listener: AppServerLogListener): () => void {
    this.logListeners.add(listener)
    return () => {
      this.logListeners.delete(listener)
    }
  }

  openManagedRelaySocket(url: string): AppServerManagedRelaySocket {
    const profileId = managedAppServerEndpointProfileId(url)
    if (!profileId) throw new Error(`app-server managed endpoint is invalid: ${url}`)
    const server = this.managedServers.get(profileId)
    if (!server || server.child.exitCode !== null || server.child.killed) {
      throw new Error(`managed app-server is not running: ${profileId}`)
    }
    if (server.transport !== 'stdio') {
      throw new Error(`managed app-server ${profileId} does not expose stdio transport`)
    }
    return createManagedStdioRelaySocket(server)
  }

  private async start(launch: ResolvedAppServerLaunch): Promise<ElectronAppServerStatus> {
    const transport = this.dependencies.launchTransport?.(launch) ?? 'websocket'
    const endpoint = transport === 'stdio'
      ? managedAppServerEndpoint(launch.profileId)
      : `ws://127.0.0.1:${await this.dependencies.reservePort()}`
    this.recentExits.delete(launch.profileId)
    const cliBinDir = this.resolveCliBinDir(launch.workspaceDir)
    const launchEnv = appServerLaunchEnv({
      profileId: launch.profileId,
      configDistribution: launch.configDistribution,
      inheritedEnv: movScriptCliPathEnv({
        cliBinDir,
      }),
    })
    if (launch.executableDiagnostic && !launch.executableDiagnostic.ok) {
      console.warn(`[app-server:${launch.profileId}] ${formatExecutableDiagnostic(launch.executableDiagnostic)}`)
    }
    const args = appServerLaunchArgs(launch.executablePath, appServerProcessListenEndpoint(transport, endpoint))
    console.info(`[app-server:${launch.profileId}] launch command=${launch.executablePath} args=${JSON.stringify(args)} transport=${transport} endpoint=${endpoint} cwd=${launch.providerSessionCwd}`)
    console.info(`[app-server:${launch.profileId}] launch provider home=${launchEnv.MOVSCRIPT_APP_SERVER_HOME ?? ''}`)
    const child = this.dependencies.spawnProcess(launch.executablePath, args, {
      cwd: launch.providerSessionCwd,
      env: launchEnv,
      shell: process.platform === 'win32',
      stdio: transport === 'stdio' ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    })
    console.info(`[app-server:${launch.profileId}] spawned pid=${child.pid ?? 'unknown'}`)
    const server: ManagedAppServer = {
      profileId: launch.profileId,
      providerKey: launch.providerKey,
      ...(launch.label ? { label: launch.label } : {}),
      endpoint,
      transport,
      executablePath: launch.executablePath,
      home: launch.home,
      rustLog: launchEnv.RUST_LOG,
      workspaceDir: launch.workspaceDir,
      workspaceContext: launch.workspaceContext,
      providerSessionCwd: launch.providerSessionCwd,
      ...(cliBinDir ? { cliBinDir } : {}),
      cliEnv: movScriptCliStatusEnv(launchEnv),
      configDistribution: launch.configDistribution,
      pluginBootstrap: launch.pluginBootstrap,
      ...(launch.executableDiagnostic ? { executableDiagnostic: launch.executableDiagnostic } : {}),
      child,
      startedAt: this.now(),
    }
    this.managedServers.set(launch.profileId, server)
    if (transport === 'websocket') {
      child.stdout?.on('data', (chunk) => {
        const text = String(chunk)
        server.stdoutExcerpt = appendProcessOutputExcerpt(server.stdoutExcerpt, text)
        this.emitLog(server, 'stdout', text)
        console.info(`[app-server:${launch.profileId}] ${text.trimEnd()}`)
      })
    }
    child.stderr?.on('data', (chunk) => {
      const text = String(chunk)
      server.stderrExcerpt = appendProcessOutputExcerpt(server.stderrExcerpt, text)
      this.emitLog(server, 'stderr', text)
      console.info(`[app-server:${launch.profileId}] ${text.trimEnd()}`)
    })
    child.on('error', (error) => {
      server.lastError = appServerSpawnErrorMessage(error, launch)
      console.error(`[app-server:${launch.profileId}] app-server spawn error`, error)
    })
    child.on('exit', (code, signal) => {
      const requestedStop = this.stoppingProfiles.delete(launch.profileId)
      server.lastError = code === 0 || requestedStop ? undefined : `app-server exited code=${code ?? 'null'} signal=${signal ?? 'null'}`
      console.info(`[app-server:${launch.profileId}] app-server exited code=${code ?? 'null'} signal=${signal ?? 'null'} requestedStop=${requestedStop} runtimeMs=${Math.max(0, this.now() - server.startedAt)}`)
      const current = this.managedServers.get(launch.profileId)
      if (current?.child === child) this.managedServers.delete(launch.profileId)
      if (!requestedStop) {
        this.recentExits.set(launch.profileId, {
          profileId: launch.profileId,
          providerKey: launch.providerKey,
          ...(launch.label ? { label: launch.label } : {}),
          endpoint,
          transport,
          executablePath: launch.executablePath,
          home: launch.home,
          rustLog: launchEnv.RUST_LOG,
          workspaceDir: launch.workspaceDir,
          workspaceContext: launch.workspaceContext,
          providerSessionCwd: launch.providerSessionCwd,
          ...(server.cliBinDir ? { cliBinDir: server.cliBinDir } : {}),
          ...(server.cliEnv ? { cliEnv: server.cliEnv } : {}),
          configDistribution: server.configDistribution,
          pluginBootstrap: server.pluginBootstrap,
          ...(server.executableDiagnostic ? { executableDiagnostic: server.executableDiagnostic } : {}),
          identity: launch.identity,
          exitedAt: this.now(),
          runtimeMs: Math.max(0, this.now() - server.startedAt),
          code,
          signal,
          ...(server.stdoutExcerpt ? { stdoutExcerpt: server.stdoutExcerpt } : {}),
          ...(server.stderrExcerpt ? { stderrExcerpt: server.stderrExcerpt } : {}),
        })
      }
      this.recordProviderSession(server, requestedStop ? 'stopped' : code === 0 ? 'exited' : 'error')
    })

    try {
      if (transport === 'websocket') await this.dependencies.waitReady(endpoint)
      this.recordProviderSession(server, 'running')
      const status = this.status(launch.profileId)
      logAppServerStatusDecision('start ready', status)
      return status
    } catch (error) {
      const waitError = errorMessage(error)
      server.lastError = server.lastError ? `${server.lastError}; readiness: ${waitError}` : waitError
      console.warn(`[app-server:${launch.profileId}] readiness failed: ${waitError}`)
      if (child.exitCode === null && !child.killed) child.kill()
      const status = this.status(launch.profileId)
      logAppServerStatusDecision('start failed', status)
      return status
    }
  }

  private async stopChildProcess(server: ManagedAppServer): Promise<void> {
    const child = server.child
    if (server.transport === 'stdio' && child.stdin && typeof child.stdin.end === 'function') {
      console.info(`[app-server:${server.profileId}] closing stdio stdin for graceful shutdown`)
      try {
        child.stdin.end()
      } catch (error) {
        console.warn(`[app-server:${server.profileId}] failed to close stdio stdin; falling back to kill`, error)
        child.kill()
      }
    } else {
      child.kill()
    }

    try {
      await waitForChildExit(child, APP_SERVER_GRACEFUL_STOP_TIMEOUT_MS)
    } catch (error) {
      console.warn(`[app-server:${server.profileId}] graceful stop timed out; forcing process termination`, error)
      if (child.exitCode === null && !child.killed) child.kill()
      await waitForChildExit(child, 1_000).catch(() => undefined)
    }
  }

  private resolveLaunch(input: ElectronAppServerEnsureInput | undefined, options: { bootstrapPlugin?: boolean } = {}): ResolvedAppServerLaunch | { status: ElectronAppServerStatus } {
    const profile = input?.profile
    const profileId = profile?.id?.trim()
    if (!profileId) return { status: appServerError('app-server', 'app-server profile id is required') }
    const providerKey = resolveAppServerKey(profile)
    const label = profile?.label?.trim() || undefined
    const workspaceDir = resolveAppServerWorkspaceDir(profile?.workspaceDir?.trim(), this.dependencies.defaultWorkspaceDir())
    const workspaceContextPaths = ensureMovScriptWorkspaceContext(resolveMovScriptWorkspaceContextPaths({
      workspaceDir,
      ...input?.workspaceContext,
    }))
    const workspaceContext = workspaceContextPaths.context
    const providerSessionCwd = workspaceContextPaths.providerSessionCwd
    const managedBinDir = managedAppServerBinDir(workspaceDir)
    try {
      materializePackagedAppServerBinary({
        providerKey,
        workspaceDir,
        resourcesPath: this.dependencies.resourcesPath?.(),
      })
    } catch (error) {
      return {
        status: appServerError(profileId, errorMessage(error)),
      }
    }
    const explicitExecutablePath = explicitAppServerExecutablePath(profile, providerKey)
    const executableResolution = explicitExecutablePath
      ? { executablePath: explicitExecutablePath, found: true }
      : defaultAppServerExecutableResolution(providerKey, profile, managedBinDir)
    const executablePath = executableResolution.executablePath
    const executableDiagnostic = executableResolution.diagnostic ?? fallbackAppServerExecutableDiagnostic(providerKey, executablePath, profile)
    const home = resolveAppServerHome(profile?.home?.trim(), workspaceDir, providerKey)
    const configDistribution = this.dependencies.distributeConfig({
      workspaceDir,
      home,
      providerKey,
      compatibilityHomeEnvNames: profile?.compatibilityHomeEnvNames,
    })
    if (!configDistribution.accountConfigured) {
      return {
        status: appServerAccountMissingStatus({
          profileId,
          distribution: configDistribution,
        }),
      }
    }
    const pluginBootstrap = options.bootstrapPlugin === false
      ? appServerPluginNotBootstrapped()
      : this.dependencies.ensurePlugin({ home })
    if (!pluginBootstrap.ok) {
      const config = appServerConfigStatusFromDistribution(configDistribution)
      return {
        status: {
          ok: false,
          running: false,
          managed: true,
          profileId,
          ...(label ? { label } : {}),
          executablePath,
          home,
          workspaceDir,
          workspaceContext,
          providerSessionCwd,
          config,
          preflight: appServerPreflightFromDistribution(configDistribution),
          plugin: pluginBootstrap,
          ...(executableDiagnostic ? { executableDiagnostic } : {}),
          error: pluginBootstrap.error ?? 'MovScript app-server plugin bootstrap failed.',
        },
      }
    }
    const launchConfigDistribution = {
      ...configDistribution,
      hash: `${configDistribution.hash}:${pluginBootstrap.hash}`,
    }
    const identity = appServerLaunchIdentity({
      executablePath,
      home,
      workspaceDir,
      providerSessionCwd,
      configDistribution: launchConfigDistribution,
    })
    return {
      profileId,
      providerKey,
      label,
      executablePath,
      workspaceDir,
      workspaceContext,
      providerSessionCwd,
      home,
      configDistribution: launchConfigDistribution,
      pluginBootstrap,
      ...(executableDiagnostic ? { executableDiagnostic } : {}),
      identity,
    }
  }

  private now(): number {
    return this.dependencies.now?.() ?? Date.now()
  }

  private resolveCliBinDir(workspaceDir: string): string | undefined {
    const resourcesPath = this.dependencies.resourcesPath?.()
    return this.dependencies.ensureWorkspaceCliBin?.({ workspaceDir, resourcesPath })
      ?? this.dependencies.resolveCliBinDir?.({ workspaceDir, resourcesPath })
  }

  private emitLog(
    server: Pick<ManagedAppServer, 'profileId' | 'providerKey' | 'label' | 'transport' | 'endpoint'>,
    stream: ElectronAppServerLogEvent['stream'],
    chunk: string,
  ): void {
    if (!chunk) return
    const event: ElectronAppServerLogEvent = {
      profileId: server.profileId,
      providerKey: server.providerKey,
      ...(server.label ? { label: server.label } : {}),
      stream,
      chunk,
      at: new Date(this.now()).toISOString(),
      transport: server.transport,
      endpoint: server.endpoint,
    }
    for (const listener of Array.from(this.logListeners)) listener(event)
  }

  private recordProviderSession(server: Pick<ManagedAppServer, 'workspaceDir' | 'workspaceContext' | 'providerSessionCwd' | 'profileId' | 'providerKey' | 'label' | 'endpoint' | 'executablePath' | 'home'>, status: string): void {
    try {
      this.dependencies.recordProviderSession?.({
        ...(server.workspaceDir ? { workspaceDir: server.workspaceDir } : {}),
        ...(server.workspaceContext ? { workspaceContext: server.workspaceContext } : {}),
        ...(server.providerSessionCwd ? { providerSessionCwd: server.providerSessionCwd } : {}),
        providerProfileKey: server.providerKey,
        providerProfileId: server.profileId,
        providerKey: server.providerKey,
        ...(server.label ? { label: server.label } : {}),
        ...(server.endpoint ? { endpoint: server.endpoint } : {}),
        executablePath: server.executablePath,
        home: server.home,
        status,
        now: new Date(this.now()),
      })
    } catch (error) {
      console.warn(`[app-server:${server.profileId}] failed to update MovScript provider session index`, error)
    }
  }
}

type ResolvedAppServerLaunch = {
  profileId: string
  providerKey: AppServerProviderKey
  label?: string
  executablePath: string
  workspaceDir: string
  workspaceContext: MovScriptWorkspaceContext
  providerSessionCwd: string
  home: string
  configDistribution: AppServerConfigDistribution
  pluginBootstrap: AppServerPluginBootstrap
  executableDiagnostic?: ElectronAppServerExecutableDiagnostic
  identity: AppServerLaunchIdentity
}

export const appServerManager = new AppServerManager()

function appServerError(profileId: string, error: string): ElectronAppServerStatus {
  return {
    ok: false,
    running: false,
    managed: false,
    profileId,
    error,
  }
}

function appServerRecentExitStatus(exit: RecentAppServerExit, cooldownMs: number): ElectronAppServerStatus {
  const output = appServerRecentExitOutputExcerpt(exit)
  const config = appServerConfigStatusFromDistribution(exit.configDistribution)
  return {
    ok: false,
    running: false,
    managed: true,
    profileId: exit.profileId,
    ...(exit.label ? { label: exit.label } : {}),
    executablePath: exit.executablePath,
    home: exit.home,
    ...(exit.rustLog ? { rustLog: exit.rustLog } : {}),
    ...(exit.workspaceDir ? { workspaceDir: exit.workspaceDir } : {}),
    ...(exit.workspaceContext ? { workspaceContext: exit.workspaceContext } : {}),
    ...(exit.providerSessionCwd ? { providerSessionCwd: exit.providerSessionCwd } : {}),
    ...(exit.cliBinDir ? { cliBinDir: exit.cliBinDir } : {}),
    ...(exit.cliEnv ? { cliEnv: exit.cliEnv } : {}),
    config,
    preflight: appServerPreflightFromDistribution(exit.configDistribution),
    plugin: exit.pluginBootstrap,
    ...(exit.executableDiagnostic ? { executableDiagnostic: exit.executableDiagnostic } : {}),
    error: `app-server exited code=${exit.code ?? 'null'} signal=${exit.signal ?? 'null'} after ${exit.runtimeMs}ms; restart cooldown ${Math.ceil(cooldownMs / 1000)}s.${output ? ` ${output}` : ''}`,
  }
}

function appendProcessOutputExcerpt(previous: string | undefined, chunk: string): string {
  const combined = `${previous ?? ''}${chunk}`
  return combined.length > APP_SERVER_OUTPUT_EXCERPT_LIMIT
    ? combined.slice(combined.length - APP_SERVER_OUTPUT_EXCERPT_LIMIT)
    : combined
}

function movScriptCliStatusEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries([
    ['MOVSCRIPT_NODE_BIN', env.MOVSCRIPT_NODE_BIN],
    ['MOVSCRIPT_ELECTRON_BIN', env.MOVSCRIPT_ELECTRON_BIN],
  ].filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim().length > 0))
}

function waitForChildExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null) return Promise.resolve()
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>
    const cleanup = () => {
      clearTimeout(timer)
      child.off('exit', onExit)
      child.off('error', onError)
    }
    const onExit = () => {
      cleanup()
      resolve()
    }
    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }
    timer = setTimeout(() => {
      cleanup()
      reject(new Error(`timed out waiting ${timeoutMs}ms for child process exit`))
    }, timeoutMs)
    child.once('exit', onExit)
    child.once('error', onError)
  })
}

function appServerRecentExitOutputExcerpt(exit: RecentAppServerExit): string {
  const stderr = exit.stderrExcerpt?.trim()
  if (stderr) return `stderr: ${stderr}`
  const stdout = exit.stdoutExcerpt?.trim()
  return stdout ? `stdout: ${stdout}` : ''
}

function appServerPluginNotBootstrapped(): AppServerPluginBootstrap {
  return {
    ok: true,
    marketplaceName: 'movscript-bundled',
    pluginName: 'movscript',
    pluginKey: 'movscript@movscript-bundled',
    pluginSourcePath: '',
    marketplaceRoot: '',
    installedPluginRoot: '',
    version: 'not-bootstrapped',
    hash: 'not-bootstrapped',
  }
}

function resolveAppServerHome(value: string | undefined, workspaceDir: string, providerKey: AppServerProviderKey): string {
  const defaultHome = defaultManagedAppServerHomePath(providerKey)
  const input = value?.trim() || defaultHome
  if (input === '~' || input.startsWith('~/') || isAbsolute(input)) {
    throw new Error(`app-server home must be a MovScript-managed relative workspace path: ${input}`)
  }
  if (!isMovScriptManagedAppServerHome(input)) {
    throw new Error(`app-server home must be under a MovScript-managed provider home such as .movscript/.<provider>: ${input}`)
  }
  const root = resolve(workspaceDir || process.cwd())
  const resolved = resolve(root, input)
  const relativeToWorkspace = relative(root, resolved)
  if (!relativeToWorkspace || relativeToWorkspace.startsWith('..') || isAbsolute(relativeToWorkspace)) {
    throw new Error(`app-server home must stay inside the MovScript workspace: ${input}`)
  }
  return resolved
}

function resolveAppServerWorkspaceDir(value: string | undefined, defaultWorkspaceDir: string): string {
  const root = resolve(defaultWorkspaceDir)
  const input = value?.trim()
  if (!input || input === '.') return root
  return isAbsolute(input) ? resolve(input) : resolve(root, input)
}

function resolveAppServerKey(profile: ElectronAppServerEnsureInput['profile'] | undefined): AppServerProviderKey {
  const explicitProviderKey = normalizeAppServerKey(profile?.providerKey)
  if (explicitProviderKey) return explicitProviderKey
  const id = profile?.id?.trim().toLowerCase() ?? ''
  const keyFromManagedProfileId = appServerKeyFromManagedProfileId(id)
  if (keyFromManagedProfileId) return keyFromManagedProfileId
  const home = profile?.home?.trim()
  if (home) {
    const keyFromHome = appServerKeyFromManagedHome(home)
    if (keyFromHome) return keyFromHome
  }
  return DEFAULT_APP_SERVER_PROVIDER_KEY
}

function appServerKeyFromManagedProfileId(value: string): AppServerProviderKey | undefined {
  const match = value.match(/^([a-z0-9][a-z0-9_-]*)-movscript-home$/)
  return normalizeAppServerKey(match?.[1])
}

function isMovScriptManagedAppServerHome(value: string): boolean {
  return Boolean(appServerKeyFromManagedHome(value))
}

function defaultManagedAppServerHomePath(providerKey: AppServerProviderKey): string {
  return `.movscript/.${providerKey}`
}

function appServerKeyFromManagedHome(value: string): AppServerProviderKey | undefined {
  const normalized = value.replace(/\\/g, '/')
  const match = normalized.match(/^\.movscript\/\.([a-z0-9][a-z0-9_-]*)(?:\/.*)?$/i)
  return normalizeAppServerKey(match?.[1])
}

function normalizeAppServerKey(value: string | undefined): AppServerProviderKey | undefined {
  const normalized = value?.trim().toLowerCase()
  return normalized && /^[a-z0-9][a-z0-9_-]*$/.test(normalized) ? normalized : undefined
}

function resolveAppServerDefaultWorkspaceDir(): string {
  return resolveDesktopDefaultMovScriptWorkspaceDir()
}

function defaultAppServerExecutableResolution(providerKey: AppServerProviderKey, profile?: ElectronAppServerProfile, managedBinDir?: string): AppServerExecutableResolution {
  return resolveAppServerExecutableResolution({ provider: providerKey, profile, managedBinDir })
}

function explicitAppServerExecutablePath(profile: ElectronAppServerEnsureInput['profile'] | undefined, providerKey: AppServerProviderKey): string | undefined {
  const executablePath = profile?.executablePath?.trim()
  if (!executablePath) return undefined
  const executableProfile = appServerExecutableProfile(providerKey, profile)
  if (isPathLikeExecutable(executablePath)) return executablePath
  if (executablePath === executableProfile.command && executableProfile.missingExecutableFound === false) {
    return undefined
  }
  return executablePath
}

function isPathLikeExecutable(value: string): boolean {
  return value.includes('/') || value.includes('\\') || isAbsolute(value)
}

function fallbackAppServerExecutableDiagnostic(
  providerKey: AppServerProviderKey,
  executablePath: string,
  inputProfile?: ElectronAppServerProfile,
): ElectronAppServerExecutableDiagnostic | undefined {
  const profile = appServerExecutableProfile(providerKey, inputProfile)
  if (profile.missingExecutableFound || executablePath !== profile.command) return undefined
  return {
    ok: false,
    message: appServerExecutableFallbackMessage(profile),
    envVar: 'MOVSCRIPT_APP_SERVER_BIN',
    cwd: process.cwd(),
    sourceDir: dirname(new URL(import.meta.url).pathname),
  }
}

export function resolveAppServerExecutablePath(input: AppServerExecutableResolutionInput = {}): string | undefined {
  const resolution = resolveAppServerExecutableResolution(input)
  return resolution.found ? resolution.executablePath : undefined
}

export function resolveAppServerExecutableResolution(input: AppServerExecutableResolutionInput = {}): AppServerExecutableResolution {
  const provider = input.provider ?? DEFAULT_APP_SERVER_PROVIDER_KEY
  const profile = appServerExecutableProfile(provider, input.profile)
  const env = input.env ?? process.env
  const neutralEnvPath = env.MOVSCRIPT_APP_SERVER_BIN?.trim()
  if (neutralEnvPath) {
    return {
      executablePath: neutralEnvPath,
      found: true,
      diagnostic: {
        ok: true,
        message: 'App-server executable resolved from MOVSCRIPT_APP_SERVER_BIN.',
        envVar: 'MOVSCRIPT_APP_SERVER_BIN',
      },
    }
  }
  const providerEnvPath = env[profile.providerEnvVar]?.trim()
  if (providerEnvPath) {
    return {
      executablePath: providerEnvPath,
      found: true,
      diagnostic: {
        ok: true,
        message: `${profile.label} app-server executable resolved from ${profile.providerEnvVar}.`,
        envVar: profile.providerEnvVar,
      },
    }
  }
  for (const envVar of profile.legacyEnvVars ?? []) {
    const envPath = env[envVar]?.trim()
    if (envPath) {
      return {
        executablePath: envPath,
        found: true,
        diagnostic: {
          ok: true,
          message: `${profile.label} app-server executable resolved from ${envVar}.`,
          envVar,
        },
      }
    }
  }
  const cwd = input.cwd ?? process.cwd()
  const sourceDir = input.sourceDir ?? dirname(new URL(import.meta.url).pathname)
  const exists = input.exists ?? existsSync
  const candidates = appServerExecutableCandidates({
    profile,
    cwd,
    sourceDir,
    managedBinDir: input.managedBinDir,
  })
  const discovered = candidates.find((candidate) => exists(candidate))
  if (discovered) {
    return {
      executablePath: discovered,
      found: true,
      diagnostic: {
        ok: true,
        message: `${profile.label} app-server executable discovered from a provider debug checkout.`,
        cwd,
        sourceDir,
        candidatePaths: candidates,
      },
    }
  }
  return {
    executablePath: profile.command,
    found: profile.missingExecutableFound,
    diagnostic: {
      ok: profile.missingExecutableFound,
      message: appServerExecutableFallbackMessage(profile),
      envVar: 'MOVSCRIPT_APP_SERVER_BIN',
      cwd,
      sourceDir,
      ...(candidates.length ? { candidatePaths: candidates } : {}),
    },
  }
}

function appServerExecutableProfile(provider: AppServerProviderKey, profile?: ElectronAppServerProfile): AppServerExecutableProfile {
  const generic = genericAppServerExecutableProfile(provider)
  return {
    ...generic,
    command: profile?.executableCommand?.trim() || generic.command,
    providerEnvVar: normalizeEnvironmentVariableName(profile?.executableEnvVar) ?? generic.providerEnvVar,
    legacyEnvVars: normalizeEnvironmentVariableNames(profile?.compatibilityBinEnvNames),
    candidateRootRelativePaths: normalizeStringList(profile?.candidateRootRelativePaths),
    candidateBinaryNames: normalizeStringList(profile?.candidateBinaryNames),
    missingExecutableFound: typeof profile?.pathFallbackReady === 'boolean' ? profile.pathFallbackReady : generic.missingExecutableFound,
    label: profile?.label?.trim() || generic.label,
  }
}

function genericAppServerExecutableProfile(provider: AppServerProviderKey): AppServerExecutableProfile {
  return {
    providerKey: provider,
    command: provider,
    providerEnvVar: appServerProviderExecutableEnvVar(provider),
    missingExecutableFound: true,
    label: appServerProviderLabel(provider),
  }
}

function appServerProviderExecutableEnvVar(provider: AppServerProviderKey): string {
  return `MOVSCRIPT_${provider.toUpperCase().replace(/-/g, '_')}_APP_SERVER_BIN`
}

function normalizeStringList(value: string[] | undefined): string[] | undefined {
  const values = (value ?? []).flatMap((item) => typeof item === 'string' && item.trim() ? [item.trim()] : [])
  return values.length > 0 ? Array.from(new Set(values)) : undefined
}

function normalizeEnvironmentVariableNames(value: string[] | undefined): string[] | undefined {
  const values = (value ?? []).flatMap((item) => normalizeEnvironmentVariableName(item) ? [normalizeEnvironmentVariableName(item)!] : [])
  return values.length > 0 ? Array.from(new Set(values)) : undefined
}

function normalizeEnvironmentVariableName(value: unknown): string | undefined {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return /^[A-Z_][A-Z0-9_]*$/.test(normalized) ? normalized : undefined
}

function appServerExecutableCandidates(input: { profile: AppServerExecutableProfile, cwd: string, sourceDir: string, managedBinDir?: string }): string[] {
  const relativeRoots = input.profile.candidateRootRelativePaths ?? []
  const roots = [
    ...relativeRoots.map((root) => resolve(input.cwd, root)),
    ...relativeRoots.map((root) => resolve(input.sourceDir, '../../../../', root)),
  ]
  const binaryNames = input.profile.candidateBinaryNames ?? []
  return [
    ...managedAppServerExecutableCandidates(input.profile, input.managedBinDir),
    ...roots.flatMap((root) => binaryNames.map((binaryName) => resolve(root, binaryName))),
  ]
}

function managedAppServerExecutableCandidates(profile: AppServerExecutableProfile, managedBinDir?: string): string[] {
  if (!managedBinDir) return []
  return [
    managedAppServerExecutablePath(managedBinDir, profile.providerKey),
    join(managedBinDir, profile.providerKey, desktopAppServerBinaryName(process.platform)),
  ]
}

function managedAppServerBinDir(workspaceDir: string): string {
  return join(resolveMovScriptWorkspaceRootPaths(workspaceDir).controlDir, 'bin')
}

function managedAppServerExecutablePath(managedBinDir: string, providerKey: AppServerProviderKey, platform = process.platform): string {
  const extension = platform === 'win32' ? '.exe' : ''
  return join(managedBinDir, `${providerKey}-app-server${extension}`)
}

function materializePackagedAppServerBinary(input: {
  providerKey: AppServerProviderKey
  workspaceDir: string
  resourcesPath?: string
  platform?: NodeJS.Platform
  arch?: string
}): string | undefined {
  const source = packagedAppServerSourceCandidates(input)
    .find((candidate) => existsSync(candidate) && statSync(candidate).isFile())
  if (!source) return undefined

  const binDir = managedAppServerBinDir(input.workspaceDir)
  const target = managedAppServerExecutablePath(binDir, input.providerKey, input.platform ?? process.platform)
  mkdirSync(binDir, { recursive: true })
  if (shouldCopyPackagedAppServerBinary(source, target)) {
    copyFileSync(source, target)
  }
  if ((input.platform ?? process.platform) !== 'win32') chmodSync(target, 0o755)
  return target
}

function shouldCopyPackagedAppServerBinary(source: string, target: string): boolean {
  if (!existsSync(target)) return true
  const sourceStat = statSync(source)
  const targetStat = statSync(target)
  return sourceStat.size !== targetStat.size || targetStat.mtimeMs < sourceStat.mtimeMs
}

function packagedAppServerSourceCandidates(input: {
  providerKey: AppServerProviderKey
  resourcesPath?: string
  platform?: NodeJS.Platform
  arch?: string
}): string[] {
  const resourcesPath = input.resourcesPath
  if (!resourcesPath) return []
  const platform = input.platform ?? process.platform
  const arch = input.arch ?? process.arch
  const binary = desktopAppServerBinaryName(platform)
  return [
    join(resourcesPath, 'app-server', input.providerKey, platform, arch, binary),
    join(resourcesPath, 'app-server', input.providerKey, platform, binary),
    join(resourcesPath, 'app-server', input.providerKey, binary),
  ]
}

function desktopAppServerBinaryName(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'app-server.exe' : 'app-server'
}

function appServerExecutableFallbackMessage(profile: AppServerExecutableProfile): string {
  const providerOverride = `${profile.providerEnvVar} for a ${profile.label} app-server override`
  const legacyOverrides = profile.legacyEnvVars?.length
    ? `, or ${profile.legacyEnvVars.join(' / ')} for legacy ${profile.label} debug compatibility`
    : ''
  return `${profile.label} app-server executable was not found; falling back to PATH command "${profile.command}". Set MOVSCRIPT_APP_SERVER_BIN for a provider-neutral override, ${providerOverride}${legacyOverrides}.`
}

function appServerProviderLabel(provider: AppServerProviderKey): string {
  return provider.split(/[-_]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ') || 'App-server'
}

function appServerSpawnErrorMessage(error: Error, launch: ResolvedAppServerLaunch): string {
  const base = errorMessage(error)
  const diagnostic = launch.executableDiagnostic
  if (!diagnostic || diagnostic.ok) return base
  return `${base}. ${formatExecutableDiagnostic(diagnostic)}`
}

function formatExecutableDiagnostic(diagnostic: ElectronAppServerExecutableDiagnostic): string {
  const parts = [diagnostic.message]
  if (diagnostic.envVar && !diagnostic.message.includes(diagnostic.envVar)) {
    parts.push(`Set ${diagnostic.envVar} to the Mova app-server binary to bypass auto-discovery.`)
  }
  if (diagnostic.cwd) parts.push(`cwd=${diagnostic.cwd}`)
  if (diagnostic.sourceDir) parts.push(`sourceDir=${diagnostic.sourceDir}`)
  if (diagnostic.candidatePaths?.length) parts.push(`checked=${diagnostic.candidatePaths.join(', ')}`)
  return parts.join(' ')
}

function formatLaunchDiagnostic(launch: ResolvedAppServerLaunch): string {
  return [
    `provider=${launch.providerKey}`,
    `command=${launch.executablePath}`,
    `home=${launch.home}`,
    `workspaceDir=${launch.workspaceDir}`,
    `cwd=${launch.providerSessionCwd}`,
    `baseURL=${launch.configDistribution.baseURL}`,
    `accountSource=${launch.configDistribution.accountSource}`,
    `configHash=${launch.identity.configHash}`,
    `accountConfigured=${launch.configDistribution.accountConfigured}`,
    `pluginKey=${launch.pluginBootstrap.pluginKey}`,
    `pluginVersion=${launch.pluginBootstrap.version}`,
  ].join(' ')
}

function logAppServerStatusDecision(reason: string, status: ElectronAppServerStatus): void {
  const parts = [
    reason,
    `ok=${status.ok}`,
    `running=${status.running}`,
    `managed=${status.managed}`,
    `endpoint=${status.endpoint ?? 'none'}`,
    `home=${status.home ?? 'none'}`,
  ]
  if (status.preflight) parts.push(`preflight=${status.preflight.ok}:${status.preflight.detail}`)
  if (status.error) parts.push(`error=${status.error}`)
  console.info(`[app-server:${status.profileId}] ${parts.join(' ')}`)
}

function defaultAppServerLaunchTransport(): AppServerLaunchTransport {
  return process.env.MOVSCRIPT_APP_SERVER_TRANSPORT === 'websocket' ? 'websocket' : 'stdio'
}

function managedAppServerEndpoint(profileId: string): string {
  return `managed:///${encodeURIComponent(profileId)}`
}

function managedAppServerEndpointProfileId(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (url.protocol !== 'managed:') return undefined
    return decodeURIComponent(url.pathname.replace(/^\/+/, '') || url.hostname).trim() || undefined
  } catch {
    return undefined
  }
}

function appServerProcessListenEndpoint(transport: AppServerLaunchTransport, endpoint: string): string {
  return transport === 'stdio' ? 'stdio://' : endpoint
}

function createManagedStdioRelaySocket(server: ManagedAppServer): AppServerManagedRelaySocket {
  const stdin = server.child.stdin
  const stdout = server.child.stdout
  if (!stdin || !stdout || typeof stdin.write !== 'function') {
    throw new Error(`managed app-server stdio is unavailable: ${server.profileId}`)
  }
  const messageHandlers = new Set<(data: string) => void>()
  const errorHandlers = new Set<(error: Error) => void>()
  const closeHandlers = new Set<() => void>()
  let buffer = ''
  let closed = false
  const cleanup = () => {
    stdout.off('data', onData)
    stdout.off('error', onError)
    server.child.off('error', onError)
    server.child.off('exit', onClose)
  }
  const close = () => {
    if (closed) return
    closed = true
    cleanup()
    for (const handler of closeHandlers) handler()
  }
  const onData = (chunk: Buffer | string) => {
    buffer += String(chunk)
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const message = line.endsWith('\r') ? line.slice(0, -1) : line
      if (!message) continue
      for (const handler of messageHandlers) handler(message)
    }
  }
  const onError = (error: Error) => {
    if (closed) return
    for (const handler of errorHandlers) handler(error)
    close()
  }
  const onClose = () => close()
  stdout.on('data', onData)
  stdout.once('error', onError)
  server.child.once('error', onError)
  server.child.once('exit', onClose)
  return {
    send: (payload) => {
      if (closed || server.child.exitCode !== null || server.child.killed) {
        throw new Error(`managed app-server is not running: ${server.profileId}`)
      }
      stdin.write(`${payload}\n`)
    },
    close,
    onMessage: (handler) => { messageHandlers.add(handler) },
    onError: (handler) => { errorHandlers.add(handler) },
    onClose: (handler) => { closeHandlers.add(handler) },
  }
}

function appServerLaunchArgs(executablePath: string, endpoint: string): string[] {
  return executableKindFromPath(executablePath) === 'app-server'
    ? ['--listen', endpoint]
    : ['app-server', '--listen', endpoint]
}

function executableKindFromPath(executablePath: string): AppServerExecutableKind {
  const name = basename(executablePath).toLowerCase()
  if (name === 'app-server' || name === 'app-server.exe') return 'app-server'
  if (name.endsWith('-app-server') || name.endsWith('-app-server.exe')) return 'app-server'
  return 'cli'
}

function appServerLaunchIdentityCanReuse(
  existing: AppServerLaunchIdentity,
  target: AppServerLaunchIdentity,
): boolean {
  return existing.executablePath === target.executablePath
    && existing.home === target.home
    && existing.workspaceDir === target.workspaceDir
    && existing.providerSessionCwd === target.providerSessionCwd
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
        else reject(new Error('Failed to reserve local app-server port'))
      })
    })
  })
}

async function waitForAppServerReady(endpoint: string): Promise<void> {
  const healthURL = endpoint.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:')
  const readyURL = `${healthURL.replace(/\/+$/, '')}/readyz`
  const deadline = Date.now() + 10_000
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const response = await fetch(readyURL)
      if (response.ok) return
      lastError = new Error(`app-server readiness returned ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 150))
  }
  throw new Error(`Timed out waiting for app-server at ${readyURL}: ${errorMessage(lastError)}`)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
