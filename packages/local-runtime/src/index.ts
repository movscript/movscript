import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  findRuntimeApp,
  findRuntimeEndpoint,
  pidIsAlive,
  readRuntimeHomeSnapshot,
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

export interface LocalRuntimeIdentity {
  pluginVersion?: string
  pluginRoot?: string
  runtimeVersion?: string
  runtimeRoot?: string
}

export interface EnsureLocalRuntimeDaemonOptions {
  homeDir: string
  entrypoint: string
  runArgs?: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
  identity?: LocalRuntimeIdentity
  startupTimeoutMs?: number
  stopTimeoutMs?: number
}

export type LocalRuntimeProbe = Record<string, unknown> & {
  available: boolean
  endpoint?: string
}

export async function ensureLocalRuntimeDaemon(options: EnsureLocalRuntimeDaemonOptions): Promise<Record<string, unknown>> {
  const startupTimeoutMs = options.startupTimeoutMs ?? 15_000
  const stopTimeoutMs = options.stopTimeoutMs ?? 5_000
  const initial = await probeLocalRuntimeDaemon(options.homeDir)
  if (initial.available && localRuntimeServicesReady(initial) && localRuntimeMatchesRequest(initial, options)) {
    await localRuntimeControlRequest(options.homeDir, 'POST', '/touch').catch(() => undefined)
    return { status: 'ready', reused: true, ...initial }
  }

  const lock = await acquireLocalRuntimeStartupLock(options.homeDir, startupTimeoutMs)
  if (!lock) {
    const reused = await waitForLocalRuntimeReady(options.homeDir, startupTimeoutMs, options)
    if (reused) return { status: 'ready', reused: true, ...reused }
    throw new Error('MovScript local runtime daemon did not become ready while another startup was in progress')
  }

  try {
    const probe = await probeLocalRuntimeDaemon(options.homeDir)
    if (probe.available) {
      if (localRuntimeServicesReady(probe) && localRuntimeMatchesRequest(probe, options)) {
        await localRuntimeControlRequest(options.homeDir, 'POST', '/touch').catch(() => undefined)
        return { status: 'ready', reused: true, ...probe }
      }
      await stopAvailableLocalRuntimeDaemon(options.homeDir, stopTimeoutMs)
    }

    const child = spawn(process.execPath, [options.entrypoint, ...(options.runArgs ?? ['__movscript_local_node', 'run'])], {
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
    throw new Error(`MovScript local runtime daemon did not become ready within ${startupTimeoutMs}ms`)
  } finally {
    lock.release()
  }
}

export async function probeLocalRuntimeDaemon(homeDir: string): Promise<LocalRuntimeProbe> {
  const snapshot = readRuntimeHomeSnapshot(homeDir)
  const endpoint = endpointURL(findRuntimeEndpoint(snapshot, LOCAL_RUNTIME_DAEMON_CONTROL_SERVICE))
  if (!endpoint) return { available: false }
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
    return { available: false, endpoint, error: errorMessage(error) }
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
  if (!Array.isArray(status.services)) return false
  const readyServices = new Set(status.services.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    return record.ready === true && typeof record.serviceName === 'string' ? [record.serviceName] : []
  }))
  const requiredServices = status.dataPlane === 'local'
    ? [...REQUIRED_LOCAL_RUNTIME_DAEMON_SERVICES, LOCAL_DATA_SERVICE]
    : REQUIRED_LOCAL_RUNTIME_DAEMON_SERVICES
  return requiredServices.every((serviceName) => readyServices.has(serviceName))
}

export function localRuntimeMatchesIdentity(
  status: Record<string, unknown>,
  identity: LocalRuntimeIdentity | undefined,
): boolean {
  if (!identity) return true
  if (identity.pluginVersion && status.pluginVersion !== identity.pluginVersion) return false
  if (identity.pluginRoot && status.pluginRoot !== identity.pluginRoot) return false
  if (identity.runtimeVersion && status.runtimeVersion !== identity.runtimeVersion) return false
  if (identity.runtimeRoot && status.runtimeRoot !== identity.runtimeRoot) return false
  return true
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
