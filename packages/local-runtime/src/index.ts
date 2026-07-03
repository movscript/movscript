import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  createScenarioApplicationRunner,
  type ProgramAdapter,
} from '@movscript/app-runner'
import {
  cleanupStaleRuntimeRecords,
  findRuntimeApp,
  findRuntimeEndpoint,
  pidIsAlive,
  readRuntimeHomeSnapshot,
  resolveMovScriptHomeDir,
  writeRuntimeAppRecord,
  type ApplicationManifest,
  type ApplicationOwnerKind,
  type RuntimeAppRecord,
  type RuntimeHomeSnapshot,
  type ScenarioPolicyManifest,
} from '@movscript/runtime-contracts'

export const LOCAL_RUNTIME_DAEMON_APP_ID = 'movscript.local-node'
export const LOCAL_RUNTIME_DAEMON_CONTROL_SERVICE = 'movscript.local-node.control'
export const LOCAL_RUNTIME_DAEMON_GATEWAY_SERVICE = 'movscript.local-node.gateway'

const REQUIRED_LOCAL_RUNTIME_DAEMON_SERVICES = [
  LOCAL_RUNTIME_DAEMON_CONTROL_SERVICE,
  LOCAL_RUNTIME_DAEMON_GATEWAY_SERVICE,
  'movscript.project.service',
  'movscript.editing.service',
  'movscript.canvas.service',
  'movscript.local-surface.host',
  'movscript.media.pipeline',
] as const
const LOCAL_DATA_SERVICE = 'movscript.data.service'
const LOCAL_RUNTIME_LOG_DIR_NAME = 'logs'
const LOCAL_RUNTIME_DAEMON_LOG_FILE = 'local-daemon.jsonl'
const DEFAULT_LOCAL_RUNTIME_LOG_MAX_BYTES = 5 * 1024 * 1024
const DEFAULT_LOCAL_RUNTIME_LOG_RETAIN = 3

export interface LocalRuntimeIdentity {
  pluginVersion?: string
  pluginRoot?: string
  apiVersion?: string
  minDaemonApiVersion?: string
  bundleHash?: string
  runtimeVersion?: string
  runtimeRoot?: string
}

export type LocalRuntimeDataPlane = 'local' | 'cloud' | 'external'

export type PersistentLocalRuntimeDaemonAction = { type: 'shutdown' | 'restart'; reason: string }

export interface PersistentLocalRuntimeDaemonState {
  homeDir: string
  startedAt: Date
  lastActivityAt: Date
  idleTimeoutMs: number | null
  dataPlane: LocalRuntimeDataPlane
  dataServiceURL?: string
  identity: LocalRuntimeIdentity
  pluginIdentity: LocalRuntimeIdentity
  restartCount: number
  requestAction: (action: PersistentLocalRuntimeDaemonAction) => void
  snapshot: () => RuntimeHomeSnapshot
}

export interface RunPersistentLocalRuntimeDaemonOptions {
  homeDir?: string
  env?: NodeJS.ProcessEnv
  identity?: LocalRuntimeIdentity
  application: ApplicationManifest
  owner?: ApplicationOwnerKind
  scenarioForDataPlane: (dataPlane: LocalRuntimeDataPlane) => ScenarioPolicyManifest
  createProgramAdapters: (state: PersistentLocalRuntimeDaemonState) => ProgramAdapter[]
  debugEnvName?: string
  logPrefix?: string
}

export interface EnsureLocalRuntimeDaemonOptions {
  homeDir: string
  entrypoint: string
  runArgs?: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
  identity?: LocalRuntimeIdentity
  forceRestart?: boolean
  startupTimeoutMs?: number
  stopTimeoutMs?: number
}

export type LocalRuntimeProbe = Record<string, unknown> & {
  available: boolean
  endpoint?: string
}

export async function runPersistentLocalRuntimeDaemon(options: RunPersistentLocalRuntimeDaemonOptions): Promise<void> {
  const env = options.env ?? process.env
  const homeDir = options.homeDir ?? resolveMovScriptHomeDir({ env })
  const idleTimeoutMs = parseLocalRuntimeDaemonIdleTimeout(env.MOVSCRIPT_LOCAL_DAEMON_IDLE_TIMEOUT ?? env.MOVSCRIPT_LOCAL_NODE_IDLE_TIMEOUT)
  const identity = options.identity ?? {}
  let shouldExit = false
  let restartCount = 0

  while (!shouldExit) {
    const dataPlane = resolveLocalRuntimeDaemonDataPlane(env)
    const dataServiceURL = configuredDataServiceURLForLocalRuntimeDataPlane(dataPlane, env)
    const startupPolicy = options.scenarioForDataPlane(dataPlane)
    let resolveAction!: (action: PersistentLocalRuntimeDaemonAction) => void
    const actionPromise = new Promise<PersistentLocalRuntimeDaemonAction>((resolveActionPromise) => {
      resolveAction = resolveActionPromise
    })
    const state: PersistentLocalRuntimeDaemonState = {
      homeDir,
      startedAt: new Date(),
      lastActivityAt: new Date(),
      idleTimeoutMs,
      dataPlane,
      ...(dataServiceURL ? { dataServiceURL } : {}),
      identity,
      pluginIdentity: identity,
      restartCount,
      requestAction: (action) => resolveAction(action),
      snapshot: () => readRuntimeHomeSnapshot(homeDir),
    }
    writeLocalRuntimeDaemonLog(homeDir, 'daemon.starting', {
      dataPlane,
      ...(dataServiceURL ? { dataServiceURL } : {}),
      identity,
      restartCount,
    }, env)
    const runner = createScenarioApplicationRunner({
      homeDir,
      application: options.application,
      scenario: startupPolicy,
      programs: options.createProgramAdapters(state),
      log: (message, metadata) => {
        if (env[options.debugEnvName ?? 'MOVSCRIPT_LOCAL_NODE_DEBUG'] === '1') {
          process.stderr.write(`[${options.logPrefix ?? 'movscript-local-node'}] ${message} ${metadata ? JSON.stringify(metadata) : ''}\n`)
        }
      },
    })
    await runner.start()
    writeRuntimeAppRecord(homeDir, {
      applicationId: options.application.applicationId,
      owner: options.owner ?? options.application.owner,
      profile: startupPolicy.scenarioId,
      pid: process.pid,
      status: 'ready',
      ready: true,
      metadata: {
        ...identity,
        dataPlane,
        ...(dataServiceURL ? { dataServiceURL } : {}),
        idleTimeoutMs,
        restartCount,
      },
    })
    writeLocalRuntimeDaemonLog(homeDir, 'daemon.ready', {
      dataPlane,
      ...(dataServiceURL ? { dataServiceURL } : {}),
      identity,
      restartCount,
      profile: startupPolicy.scenarioId,
    }, env)
    const signalAction = installLocalRuntimeDaemonSignalHandlers(resolveAction)
    const idleAction = startLocalRuntimeDaemonIdleWatcher(state)
    const action = await actionPromise
    idleAction()
    signalAction()
    writeLocalRuntimeDaemonLog(homeDir, 'daemon.stopping', {
      action: action.type,
      reason: action.reason,
      restartCount,
    }, env)
    await runner.shutdown()
    writeRuntimeAppRecord(homeDir, {
      applicationId: options.application.applicationId,
      owner: options.owner ?? options.application.owner,
      profile: startupPolicy.scenarioId,
      pid: process.pid,
      status: action.type === 'restart' ? 'starting' : 'stopped',
      ready: action.type === 'restart',
      metadata: {
        ...identity,
        dataPlane,
        ...(dataServiceURL ? { dataServiceURL } : {}),
        reason: action.reason,
        idleTimeoutMs,
        restartCount,
      },
    })
    writeLocalRuntimeDaemonLog(homeDir, 'daemon.stopped', {
      action: action.type,
      reason: action.reason,
      restartCount,
    }, env)
    if (action.type === 'restart') {
      restartCount += 1
      continue
    }
    shouldExit = true
  }
}

export async function ensureLocalRuntimeDaemon(options: EnsureLocalRuntimeDaemonOptions): Promise<Record<string, unknown>> {
  const startupTimeoutMs = options.startupTimeoutMs ?? 15_000
  const stopTimeoutMs = options.stopTimeoutMs ?? 5_000
  cleanupStaleRuntimeRecords(options.homeDir)
  const initial = await probeLocalRuntimeDaemon(options.homeDir)
  if (!options.forceRestart && initial.available && localRuntimeServicesReady(initial) && localRuntimeMatchesRequest(initial, options)) {
    await localRuntimeControlRequest(options.homeDir, 'POST', '/touch').catch(() => undefined)
    return { status: 'ready', reused: true, ...initial }
  }

  const lock = await acquireLocalRuntimeStartupLock(options.homeDir, startupTimeoutMs)
  if (!lock) {
    const reused = await waitForLocalRuntimeReady(options.homeDir, startupTimeoutMs, options)
    if (reused) return { status: 'ready', reused: true, ...reused }
    const lastProbe = await probeLocalRuntimeDaemon(options.homeDir)
    throw new Error(`MovScript local runtime daemon did not become ready while another startup was in progress; ${localRuntimeReadinessSummary(lastProbe, options)}`)
  }

  try {
    const probe = await probeLocalRuntimeDaemon(options.homeDir)
    if (probe.available) {
      if (!options.forceRestart && localRuntimeServicesReady(probe) && localRuntimeMatchesRequest(probe, options)) {
        await localRuntimeControlRequest(options.homeDir, 'POST', '/touch').catch(() => undefined)
        return { status: 'ready', reused: true, ...probe }
      }
      await stopAvailableLocalRuntimeDaemon(options.homeDir, stopTimeoutMs)
    }

    writeLocalRuntimeDaemonLog(options.homeDir, 'daemon.ensure.spawn', {
      entrypoint: options.entrypoint,
      runArgs: options.runArgs ?? ['daemon', 'run'],
      forceRestart: options.forceRestart === true,
      identity: options.identity ?? {},
    }, options.env)
    const child = spawn(process.execPath, [options.entrypoint, ...(options.runArgs ?? ['daemon', 'run'])], {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...(options.env ?? {}),
        MOVSCRIPT_HOME: options.homeDir,
      },
      detached: true,
      stdio: 'ignore',
    })
    child.unref()

    const ready = await waitForLocalRuntimeReady(options.homeDir, startupTimeoutMs, options)
    if (ready) return { status: 'ready', reused: false, launcherPid: child.pid, ...ready }
    const lastProbe = await probeLocalRuntimeDaemon(options.homeDir)
    writeLocalRuntimeDaemonLog(options.homeDir, 'daemon.ensure.failed', {
      entrypoint: options.entrypoint,
      launcherPid: child.pid,
      summary: localRuntimeReadinessSummary(lastProbe, options),
      lastProbe,
    }, options.env)
    throw new Error(`MovScript local runtime daemon did not become ready within ${startupTimeoutMs}ms; ${localRuntimeReadinessSummary(lastProbe, options)}`)
  } finally {
    lock.release()
  }
}

export function resolveLocalRuntimeDaemonLogPath(homeDir: string): string {
  return join(homeDir, LOCAL_RUNTIME_LOG_DIR_NAME, LOCAL_RUNTIME_DAEMON_LOG_FILE)
}

export function writeLocalRuntimeDaemonLog(
  homeDir: string,
  event: string,
  metadata: Record<string, unknown> = {},
  env: NodeJS.ProcessEnv = process.env,
): void {
  try {
    const logPath = resolveLocalRuntimeDaemonLogPath(homeDir)
    mkdirSync(dirname(logPath), { recursive: true })
    rotateLocalRuntimeDaemonLog(logPath, env)
    appendFileSync(logPath, `${JSON.stringify({
      schema: 'movscript.runtime-log-entry.v1',
      timestamp: new Date().toISOString(),
      source: 'local-runtime',
      serviceName: LOCAL_RUNTIME_DAEMON_APP_ID,
      event,
      pid: process.pid,
      ...metadata,
    })}\n`, 'utf8')
  } catch {
    // Runtime logging must never prevent daemon startup, shutdown, or recovery.
  }
}

function rotateLocalRuntimeDaemonLog(logPath: string, env: NodeJS.ProcessEnv): void {
  const maxBytes = positiveIntegerEnv(env.MOVSCRIPT_LOCAL_DAEMON_LOG_MAX_BYTES, DEFAULT_LOCAL_RUNTIME_LOG_MAX_BYTES)
  const retain = positiveIntegerEnv(env.MOVSCRIPT_LOCAL_DAEMON_LOG_RETAIN, DEFAULT_LOCAL_RUNTIME_LOG_RETAIN)
  if (maxBytes <= 0 || retain <= 0 || !existsSync(logPath)) return
  if (statSync(logPath).size < maxBytes) return
  for (let index = retain - 1; index >= 1; index -= 1) {
    const from = `${logPath}.${index}`
    const to = `${logPath}.${index + 1}`
    if (existsSync(from)) {
      rmSync(to, { force: true })
      renameSync(from, to)
    }
  }
  const rotated = `${logPath}.1`
  rmSync(rotated, { force: true })
  renameSync(logPath, rotated)
}

function positiveIntegerEnv(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback
}

export async function probeLocalRuntimeDaemon(homeDir: string): Promise<LocalRuntimeProbe> {
  const snapshot = readRuntimeHomeSnapshot(homeDir)
  const app = findRuntimeApp(snapshot, LOCAL_RUNTIME_DAEMON_APP_ID)
    ?? snapshot.apps.find((record) => record.applicationId === LOCAL_RUNTIME_DAEMON_APP_ID)
  const appProbeDetails = localRuntimeAppProbeDetails(app)
  const endpoint = endpointURL(findRuntimeEndpoint(snapshot, LOCAL_RUNTIME_DAEMON_CONTROL_SERVICE))
  if (!endpoint) return { available: false, ...appProbeDetails }
  try {
    const healthResponse = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(1000) })
    const status = healthResponse.ok
      ? await fetch(`${endpoint}/status`, { signal: AbortSignal.timeout(1000) })
        .then((item) => item.ok ? item.json() as Promise<Record<string, unknown>> : {})
        .catch(() => ({}))
      : {}
    return {
      available: healthResponse.ok,
      endpoint,
      ...(healthResponse.ok ? await healthResponse.json() as Record<string, unknown> : { error: `HTTP ${healthResponse.status}` }),
      ...status,
    }
  } catch (error) {
    return { available: false, endpoint, ...appProbeDetails, error: errorMessage(error) }
  }
}

export async function stopLocalRuntimeDaemon(homeDir: string, options: { force?: boolean } = {}): Promise<Record<string, unknown>> {
  const probe = await probeLocalRuntimeDaemon(homeDir)
  if (probe.available) return await localRuntimeControlRequest(homeDir, 'POST', '/shutdown')
  if (!options.force) return { status: 'not_running', ...probe }
  const app = findRuntimeApp(readRuntimeHomeSnapshot(homeDir), LOCAL_RUNTIME_DAEMON_APP_ID)
  if (app?.pid && app.pid !== process.pid) {
    try {
      process.kill(app.pid, 'SIGTERM')
      return { status: 'stopping', forced: true, pid: app.pid }
    } catch (error) {
      return { status: 'error', forced: true, pid: app.pid, error: errorMessage(error) }
    }
  }
  return { status: 'not_running', forced: true }
}

export async function localRuntimeControlRequest(
  homeDir: string,
  method: 'GET' | 'POST',
  path: string,
): Promise<Record<string, unknown>> {
  const snapshot = readRuntimeHomeSnapshot(homeDir)
  const endpoint = endpointURL(findRuntimeEndpoint(snapshot, LOCAL_RUNTIME_DAEMON_CONTROL_SERVICE))
  if (!endpoint) throw new Error('MovScript local runtime daemon control endpoint was not found')
  const response = await fetch(`${endpoint}${path}`, { method, signal: AbortSignal.timeout(3000) })
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) throw new Error(`local runtime daemon ${path} failed with HTTP ${response.status}: ${JSON.stringify(payload)}`)
  return payload
}

export function localRuntimeServicesReady(status: Record<string, unknown>): boolean {
  return missingLocalRuntimeServices(status).length === 0
}

export function parseLocalRuntimeDaemonIdleTimeout(value: string | undefined): number | null {
  const raw = value?.trim().toLowerCase()
  if (!raw) return null
  if (raw === 'never' || raw === '0' || raw === 'off') return null
  const match = raw.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/)
  if (!match) throw new Error(`invalid local daemon idle timeout: ${value}`)
  const amount = Number(match[1])
  const unit = match[2] ?? 'ms'
  const factor = unit === 'h' ? 60 * 60 * 1000 : unit === 'm' ? 60 * 1000 : unit === 's' ? 1000 : 1
  return Math.max(1000, Math.floor(amount * factor))
}

export function resolveLocalRuntimeDaemonDataPlane(env: NodeJS.ProcessEnv = process.env): LocalRuntimeDataPlane {
  const explicit = (env.MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE ?? env.MOVSCRIPT_LOCAL_NODE_DATA_PLANE ?? '').trim().toLowerCase()
  if (explicit === 'local' || explicit === 'cloud' || explicit === 'external') return explicit
  const mode = (env.MOVSCRIPT_PLUGIN_MODE ?? env.MOVSCRIPT_PLUGIN_SCENARIO ?? '').trim().toLowerCase()
  if (mode === 'cloud' || mode === 'plugin-cloud') return 'cloud'
  const dataServiceURL = env.MOVSCRIPT_DATA_SERVICE_URL?.trim()
  if (dataServiceURL && !isLocalHTTPURL(dataServiceURL)) return 'external'
  return 'local'
}

export function configuredDataServiceURLForLocalRuntimeDataPlane(
  dataPlane: LocalRuntimeDataPlane,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const dataServiceURL = env.MOVSCRIPT_DATA_SERVICE_URL?.trim()
  return dataPlane === 'local' ? undefined : dataServiceURL || undefined
}

function missingLocalRuntimeServices(status: Record<string, unknown>): string[] {
  const requiredServices = status.dataPlane === 'local'
    ? [...REQUIRED_LOCAL_RUNTIME_DAEMON_SERVICES, LOCAL_DATA_SERVICE]
    : REQUIRED_LOCAL_RUNTIME_DAEMON_SERVICES
  if (!Array.isArray(status.services)) return [...requiredServices]
  const readyServices = new Set(status.services.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    return record.ready === true && typeof record.serviceName === 'string' ? [record.serviceName] : []
  }))
  return requiredServices.filter((serviceName) => !readyServices.has(serviceName))
}

function localRuntimeReadinessSummary(
  status: LocalRuntimeProbe,
  options: EnsureLocalRuntimeDaemonOptions,
): string {
  const details: string[] = []
  if (status.endpoint) details.push(`controlEndpoint=${status.endpoint}`)
  details.push(`available=${status.available}`)
  if (typeof status.status === 'string') details.push(`status=${status.status}`)
  if (typeof status.error === 'string') details.push(`error=${status.error}`)
  if (typeof status.pid === 'number') details.push(`pid=${status.pid}`)
  if (typeof status.dataPlane === 'string') details.push(`dataPlane=${status.dataPlane}`)
  if (localRuntimeHasIdentityDetails(status) && !localRuntimeMatchesIdentity(status, options.identity)) {
    details.push(`identityMismatch=${JSON.stringify({
      expected: options.identity ?? {},
        actual: {
          pluginVersion: status.pluginVersion,
          pluginRoot: status.pluginRoot,
          apiVersion: status.apiVersion,
          minDaemonApiVersion: status.minDaemonApiVersion,
          bundleHash: status.bundleHash,
          runtimeVersion: status.runtimeVersion,
          runtimeRoot: status.runtimeRoot,
        },
    })}`)
  }
  if (!localRuntimeMatchesRequestedDataPlane(status, options.env)) {
    details.push(`dataPlaneMismatch=expected ${requestedLocalRuntimeDataPlane(options.env) ?? 'any'}`)
  }
  if (!localRuntimeMatchesRequestedDataServiceURL(status, options.env)) {
    details.push('dataServiceURLMismatch=true')
  }
  const missingServices = missingLocalRuntimeServices(status)
  if (missingServices.length > 0) details.push(`missingServices=${missingServices.join(',')}`)
  return details.join('; ') || 'last probe was empty'
}

function localRuntimeHasIdentityDetails(status: Record<string, unknown>): boolean {
  return typeof status.pluginVersion === 'string'
    || typeof status.pluginRoot === 'string'
    || typeof status.apiVersion === 'string'
    || typeof status.minDaemonApiVersion === 'string'
    || typeof status.bundleHash === 'string'
    || typeof status.runtimeVersion === 'string'
    || typeof status.runtimeRoot === 'string'
}

function localRuntimeAppProbeDetails(app: RuntimeAppRecord | undefined): Record<string, unknown> {
  if (!app) return {}
  const metadata = app.raw.metadata && typeof app.raw.metadata === 'object'
    ? app.raw.metadata as Record<string, unknown>
    : {}
  return {
    status: app.status,
    pid: app.pid,
    pluginVersion: metadata.pluginVersion,
    pluginRoot: metadata.pluginRoot,
    apiVersion: metadata.apiVersion,
    minDaemonApiVersion: metadata.minDaemonApiVersion,
    bundleHash: metadata.bundleHash,
    runtimeVersion: metadata.runtimeVersion,
    runtimeRoot: metadata.runtimeRoot,
    dataPlane: metadata.dataPlane,
    dataServiceURL: metadata.dataServiceURL,
    ...(typeof metadata.error === 'string' ? { error: metadata.error } : {}),
  }
}

export function localRuntimeMatchesIdentity(
  status: Record<string, unknown>,
  identity: LocalRuntimeIdentity | undefined,
): boolean {
  if (!identity) return true
  if (identity.pluginVersion && status.pluginVersion !== identity.pluginVersion) return false
  if (identity.pluginRoot && !localRuntimeSameIdentityPath(status.pluginRoot, identity.pluginRoot)) return false
  if (identity.apiVersion && status.apiVersion !== identity.apiVersion) return false
  if (identity.minDaemonApiVersion && status.minDaemonApiVersion !== identity.minDaemonApiVersion) return false
  if (identity.bundleHash && status.bundleHash !== identity.bundleHash) return false
  if (identity.runtimeVersion && status.runtimeVersion !== identity.runtimeVersion) return false
  if (identity.runtimeRoot && !localRuntimeSameIdentityPath(status.runtimeRoot, identity.runtimeRoot)) return false
  return true
}

function localRuntimeSameIdentityPath(actual: unknown, expected: string): boolean {
  if (typeof actual !== 'string' || !actual.trim()) return false
  return canonicalLocalRuntimeIdentityPath(actual) === canonicalLocalRuntimeIdentityPath(expected)
}

function canonicalLocalRuntimeIdentityPath(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

export function localRuntimeMatchesRequestedDataPlane(
  status: Record<string, unknown>,
  env: NodeJS.ProcessEnv | undefined,
): boolean {
  const expected = requestedLocalRuntimeDataPlane(env)
  if (!expected) return true
  return status.dataPlane === expected
}

export function localRuntimeMatchesRequestedDataServiceURL(
  status: Record<string, unknown>,
  env: NodeJS.ProcessEnv | undefined,
): boolean {
  const expected = normalizeDataServiceURL(env?.MOVSCRIPT_DATA_SERVICE_URL)
  if (!expected) return true
  return normalizeDataServiceURL(status.dataServiceURL) === expected
}

function localRuntimeMatchesRequest(
  status: Record<string, unknown>,
  options: EnsureLocalRuntimeDaemonOptions,
): boolean {
  return localRuntimeMatchesIdentity(status, options.identity)
    && localRuntimeMatchesRequestedDataPlane(status, options.env)
    && localRuntimeMatchesRequestedDataServiceURL(status, options.env)
}

function requestedLocalRuntimeDataPlane(env: NodeJS.ProcessEnv | undefined): 'local' | 'cloud' | 'external' | undefined {
  const explicit = (env?.MOVSCRIPT_LOCAL_DAEMON_DATA_PLANE ?? env?.MOVSCRIPT_LOCAL_NODE_DATA_PLANE ?? '').trim().toLowerCase()
  if (explicit === 'local' || explicit === 'cloud' || explicit === 'external') return explicit
  return undefined
}

function installLocalRuntimeDaemonSignalHandlers(requestAction: (action: PersistentLocalRuntimeDaemonAction) => void): () => void {
  const handleSignal = (signal: NodeJS.Signals) => {
    requestAction({ type: 'shutdown', reason: signal.toLowerCase() })
  }
  process.once('SIGTERM', handleSignal)
  process.once('SIGINT', handleSignal)
  return () => {
    process.off('SIGTERM', handleSignal)
    process.off('SIGINT', handleSignal)
  }
}

function startLocalRuntimeDaemonIdleWatcher(state: PersistentLocalRuntimeDaemonState): () => void {
  if (state.idleTimeoutMs === null) return () => undefined
  const intervalMs = Math.max(5000, Math.min(60000, Math.floor(state.idleTimeoutMs / 4)))
  const interval = setInterval(() => {
    if (Date.now() - state.lastActivityAt.getTime() >= state.idleTimeoutMs!) {
      state.requestAction({ type: 'shutdown', reason: 'idle_timeout' })
    }
  }, intervalMs)
  return () => clearInterval(interval)
}

function isLocalHTTPURL(value: string): boolean {
  try {
    const url = new URL(value)
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  } catch {
    return false
  }
}

function normalizeDataServiceURL(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const raw = value.trim()
  if (!raw) return undefined
  try {
    const url = new URL(raw)
    url.hash = ''
    url.pathname = url.pathname.replace(/\/+$/, '') || '/'
    return url.toString().replace(/\/$/, '')
  } catch {
    return raw.replace(/\/+$/, '')
  }
}

export async function waitForLocalRuntimeStop(homeDir: string, timeoutMs: number): Promise<void> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const probe = await probeLocalRuntimeDaemon(homeDir)
    if (!probe.available) return
    await delay(150)
  }
}

async function stopAvailableLocalRuntimeDaemon(homeDir: string, timeoutMs: number): Promise<void> {
  await stopLocalRuntimeDaemon(homeDir).catch(() => undefined)
  await waitForLocalRuntimeStop(homeDir, timeoutMs)
  const probe = await probeLocalRuntimeDaemon(homeDir)
  if (probe.available) {
    throw new Error('MovScript local runtime daemon is still reachable after shutdown; refusing to start another daemon')
  }
}

async function waitForLocalRuntimeReady(
  homeDir: string,
  timeoutMs: number,
  options: EnsureLocalRuntimeDaemonOptions,
): Promise<LocalRuntimeProbe | undefined> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const probe = await probeLocalRuntimeDaemon(homeDir)
    if (probe.available && localRuntimeServicesReady(probe) && localRuntimeMatchesRequest(probe, options)) return probe
    await delay(150)
  }
  return undefined
}

async function acquireLocalRuntimeStartupLock(
  homeDir: string,
  timeoutMs: number,
): Promise<{ release: () => void } | undefined> {
  const lockDir = join(homeDir, 'runtime', 'locks', `${LOCAL_RUNTIME_DAEMON_APP_ID}.startup.lock`)
  const metadataPath = join(lockDir, 'owner.json')
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    mkdirSync(dirname(lockDir), { recursive: true })
    try {
      mkdirSync(lockDir)
      writeFileSync(metadataPath, JSON.stringify({
        pid: process.pid,
        createdAt: new Date().toISOString(),
      }), 'utf8')
      return {
        release: () => {
          rmSync(lockDir, { recursive: true, force: true })
        },
      }
    } catch (error) {
      const code = typeof error === 'object' && error ? (error as NodeJS.ErrnoException).code : undefined
      if (code !== 'EEXIST') throw error
      if (isStaleStartupLock(metadataPath)) {
        rmSync(lockDir, { recursive: true, force: true })
        continue
      }
      await delay(150)
    }
  }
  return undefined
}

function isStaleStartupLock(metadataPath: string): boolean {
  if (!existsSync(metadataPath)) return false
  try {
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as Record<string, unknown>
    const pid = typeof metadata.pid === 'number' ? metadata.pid : undefined
    return !pidIsAlive(pid)
  } catch {
    return false
  }
}

function endpointURL(endpoint: { url?: string; baseURL?: string; port?: number; protocol?: string } | undefined): string | undefined {
  if (!endpoint) return undefined
  if (endpoint.url) return endpoint.url
  if (endpoint.baseURL) return endpoint.baseURL
  if (endpoint.port && endpoint.protocol === 'http') return `http://127.0.0.1:${endpoint.port}`
  if (endpoint.port) return `http://127.0.0.1:${endpoint.port}`
  return undefined
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
