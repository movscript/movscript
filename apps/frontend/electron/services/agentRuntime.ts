import type { ChildProcess } from 'child_process'
import { app } from 'electron'
import { installAgentLogTimestamps } from './agentRuntime/log'
import {
  DEFAULT_BACKEND_API_BASE_URL,
  getAgentRuntimeLaunchPolicy as readAgentRuntimeLaunchPolicy,
  normalizeBackendAPIBaseURL,
} from './agentRuntime/config'
import {
  getAgentRuntimeHealth,
  summarizeHealthCheck,
  waitForAgentRuntime,
} from './agentRuntime/health'
import {
  shouldDetachAgentRuntimeProcess,
  stopUnmanagedIncompatibleRuntime,
  terminateAgentProcess,
} from './agentRuntime/process'
import { spawnAgentRuntimeProcess } from './agentRuntime/spawn'
import {
  agentRuntimeSessionKey,
  isAgentRuntimeSessionReusable,
  removeStaleAgentRuntimeSessionFiles,
  resolveAgentRuntimeSession,
} from './agentRuntime/sessionTransport'
import {
  resolveAgentRuntimeControlTransportInput,
  type AgentRuntimeControlTransport,
  type AgentRuntimeControlTransportKind,
} from './agentRuntime/transport'

export { getAgentRuntimeLaunchPolicy } from './agentRuntime/config'

installAgentLogTimestamps('main')

let proc: ChildProcess | null = null
const sessionProcs = new Map<string, ChildProcess>()
let startPromise: Promise<AgentRuntimeStatus> | null = null
const sessionEnsurePromises = new Map<string, Promise<AgentRuntimeStatus>>()
const sessionStartPromises = new Map<string, Promise<AgentRuntimeStatus>>()
let backendAPIBaseURL = normalizeBackendAPIBaseURL(
  process.env.MOVSCRIPT_BACKEND_API_BASE_URL
    || process.env.MOVSCRIPT_API_BASE_URL
    || process.env.VITE_API_BASE_URL
    || DEFAULT_BACKEND_API_BASE_URL
  )
const shouldDetachAgentRuntime = shouldDetachAgentRuntimeProcess(app.isPackaged)

export interface AgentRuntimeStatus {
  ok: boolean
  running: boolean
  managed: boolean
  started: boolean
  baseURL: string
  transportKind: AgentRuntimeControlTransportKind
  endpoint: string
  socketPath?: string
  workspaceDir?: string
  sessionId?: string
  pid?: number
  error?: string
}

export async function ensureAgentRuntimeRunning(input: { baseURL?: string; transportKind?: AgentRuntimeControlTransportKind; socketPath?: string; workspaceDir?: string; sessionId?: string; source?: string } = {}): Promise<AgentRuntimeStatus> {
  const session = resolveAgentRuntimeSession(input)
  if (session) return ensureSessionAgentRuntimeRunning(input, session)
  const startedAt = Date.now()
  const { baseURL, transport } = resolveRuntimeTransport(input)
  const policy = readAgentRuntimeLaunchPolicy()
  console.info(`[agent] ensure runtime start transport=${transport.kind} endpoint=${transport.endpointLabel} policy=${policy} source=${input.source ?? '-'}`)
  const health = await getAgentRuntimeHealth(transport)
  console.info(`[agent] ensure runtime initial health ${summarizeHealthCheck(health)} elapsed=${Date.now() - startedAt}ms`)
  if (health.ok && health.compatible) {
    console.info(`[agent] ensure runtime already compatible elapsed=${Date.now() - startedAt}ms`)
    return runtimeStatus({
      ok: true,
      running: true,
      managed: proc !== null && !proc.killed,
      started: false,
      pid: proc?.pid,
    }, baseURL, transport)
  }
  if (policy === 'external') {
    return runtimeStatus({
      ok: false,
      running: health.ok,
      managed: false,
      started: false,
      error: health.error ?? `Agent runtime is not available at ${transport.endpointLabel}. Start it separately or set MOVSCRIPT_AGENT_POLICY=spawn.`,
    }, baseURL, transport)
  }
  if (!health.ok && isAgentRuntimeProbeTimeout(health.error)) {
    return runtimeStatus({
      ok: false,
      running: true,
      managed: proc !== null && !proc.killed,
      started: false,
      pid: proc?.pid,
      error: health.error ?? `Agent runtime at ${transport.endpointLabel} accepted the endpoint but did not answer the liveness probe.`,
    }, baseURL, transport)
  }
  if (health.ok && !health.compatible && proc && !proc.killed) {
    await stopManagedIncompatibleRuntime()
  } else if (health.ok && !health.compatible) {
    return runtimeStatus({
      ok: false,
      running: true,
      managed: false,
      started: false,
      error: health.error ?? 'Agent is running but is not compatible with this desktop app. Stop the old runtime process and restart the desktop app.',
    }, baseURL, transport)
  }

  if (startPromise) return startPromise
  startPromise = startAgentRuntime(baseURL, transport).finally(() => {
    startPromise = null
  })
  const status = await startPromise
  console.info(`[agent] ensure runtime finished ok=${status.ok} started=${status.started} elapsed=${Date.now() - startedAt}ms`)
  return status
}

async function ensureSessionAgentRuntimeRunning(
  input: { baseURL?: string; transportKind?: AgentRuntimeControlTransportKind; socketPath?: string; workspaceDir?: string; sessionId?: string; source?: string },
  session: NonNullable<ReturnType<typeof resolveAgentRuntimeSession>>,
): Promise<AgentRuntimeStatus> {
  const key = agentRuntimeSessionKey(session)
  const pending = sessionEnsurePromises.get(key)
  if (pending) return pending
  const promise = ensureSessionAgentRuntimeRunningOnce(input, session).finally(() => {
    sessionEnsurePromises.delete(key)
  })
  sessionEnsurePromises.set(key, promise)
  return promise
}

async function ensureSessionAgentRuntimeRunningOnce(
  input: { baseURL?: string; transportKind?: AgentRuntimeControlTransportKind; socketPath?: string; workspaceDir?: string; sessionId?: string; source?: string },
  session: NonNullable<ReturnType<typeof resolveAgentRuntimeSession>>,
): Promise<AgentRuntimeStatus> {
  const key = agentRuntimeSessionKey(session)
  const inputWithSessionTransport = { ...input, ...session.transportInput }
  const startedAt = Date.now()
  const { baseURL, transport } = resolveRuntimeTransport(inputWithSessionTransport)
  const policy = readAgentRuntimeLaunchPolicy()
  console.info(`[agent] ensure session runtime start workspace=${session.workspaceDir} session=${session.sessionId} endpoint=${transport.endpointLabel} policy=${policy} source=${input.source ?? '-'}`)
  const health = isAgentRuntimeSessionReusable(session)
    ? await getAgentRuntimeHealth(transport)
    : { ok: false, compatible: false, error: 'session runtime metadata is missing, stale, or dead' }
  console.info(`[agent] ensure session runtime initial health ${summarizeHealthCheck(health)} elapsed=${Date.now() - startedAt}ms`)
  if (health.ok && health.compatible) {
    const managedProc = sessionProcs.get(key)
    return runtimeStatus({
      ok: true,
      running: true,
      managed: !!managedProc && !managedProc.killed,
      started: false,
      pid: managedProc?.pid,
    }, baseURL, transport, session)
  }
  if (policy === 'external') {
    return runtimeStatus({
      ok: false,
      running: health.ok,
      managed: false,
      started: false,
      error: health.error ?? `Agent session runtime is not available at ${transport.endpointLabel}. Start it separately or set MOVSCRIPT_AGENT_POLICY=spawn.`,
    }, baseURL, transport, session)
  }
  removeStaleAgentRuntimeSessionFiles(session)

  const existingPromise = sessionStartPromises.get(key)
  if (existingPromise) return existingPromise
  const start = startSessionAgentRuntime(baseURL, transport, session).finally(() => {
    sessionStartPromises.delete(key)
  })
  sessionStartPromises.set(key, start)
  const status = await start
  console.info(`[agent] ensure session runtime finished workspace=${session.workspaceDir} session=${session.sessionId} ok=${status.ok} started=${status.started} elapsed=${Date.now() - startedAt}ms`)
  return status
}

export async function stopAgentRuntime(): Promise<void> {
  const current = proc
  if (!current) return
  proc = null
  await terminateAgentProcess(current, { detachedProcessGroup: shouldDetachAgentRuntime })
}

export async function setAgentRuntimeAPIBaseURL(apiBaseURL: string): Promise<void> {
  const next = normalizeBackendAPIBaseURL(apiBaseURL)
  if (next === backendAPIBaseURL) return
  backendAPIBaseURL = next
  process.env.MOVSCRIPT_BACKEND_API_BASE_URL = next
  process.env.MOVSCRIPT_API_BASE_URL = next
  await stopAgentRuntime()
}

async function startAgentRuntime(baseURL: string, transport: AgentRuntimeControlTransport): Promise<AgentRuntimeStatus> {
  const spawnStartedAt = Date.now()
  try {
    console.info(`[agent] start runtime begin transport=${transport.kind} endpoint=${transport.endpointLabel}`)
    const child = spawnAgentRuntimeProcess({
      baseURL,
      transport,
      backendAPIBaseURL,
      detached: shouldDetachAgentRuntime,
      spawnStartedAt,
      onExit: (exitedChild) => {
        if (proc === exitedChild) proc = null
      },
    })
    proc = child

    console.info(`[agent] spawned child pid=${child.pid ?? 'unknown'} after ${Date.now() - spawnStartedAt}ms`)
    await waitForAgentRuntime(transport, 20_000)
    console.info(`[agent] start runtime ready elapsed=${Date.now() - spawnStartedAt}ms`)
    return runtimeStatus({
      ok: true,
      running: true,
      managed: true,
      started: true,
      pid: child.pid,
    }, baseURL, transport)
  } catch (error) {
    if (proc && !proc.killed) await stopAgentRuntime()
    proc = null
    return runtimeStatus({
      ok: false,
      running: false,
      managed: false,
      started: false,
      error: error instanceof Error ? error.message : String(error),
    }, baseURL, transport)
  }
}

async function startSessionAgentRuntime(
  baseURL: string,
  transport: AgentRuntimeControlTransport,
  session: NonNullable<ReturnType<typeof resolveAgentRuntimeSession>>,
): Promise<AgentRuntimeStatus> {
  const key = agentRuntimeSessionKey(session)
  const spawnStartedAt = Date.now()
  try {
    console.info(`[agent] start session runtime begin workspace=${session.workspaceDir} session=${session.sessionId} endpoint=${transport.endpointLabel}`)
    const child = spawnAgentRuntimeProcess({
      baseURL,
      transport,
      backendAPIBaseURL,
      detached: shouldDetachAgentRuntime,
      spawnStartedAt,
      session: {
        workspaceDir: session.workspaceDir,
        sessionId: session.sessionId,
      },
      onExit: (exitedChild) => {
        if (sessionProcs.get(key) === exitedChild) sessionProcs.delete(key)
      },
    })
    sessionProcs.set(key, child)
    console.info(`[agent] spawned session child pid=${child.pid ?? 'unknown'} workspace=${session.workspaceDir} session=${session.sessionId} after ${Date.now() - spawnStartedAt}ms`)
    await waitForAgentRuntime(transport, 20_000)
    console.info(`[agent] start session runtime ready workspace=${session.workspaceDir} session=${session.sessionId} elapsed=${Date.now() - spawnStartedAt}ms`)
    return runtimeStatus({
      ok: true,
      running: true,
      managed: true,
      started: true,
      pid: child.pid,
    }, baseURL, transport, session)
  } catch (error) {
    const child = sessionProcs.get(key)
    if (child && !child.killed) await terminateAgentProcess(child, { detachedProcessGroup: shouldDetachAgentRuntime })
    sessionProcs.delete(key)
    return runtimeStatus({
      ok: false,
      running: false,
      managed: false,
      started: false,
      error: error instanceof Error ? error.message : String(error),
    }, baseURL, transport, session)
  }
}

async function stopManagedIncompatibleRuntime(): Promise<boolean> {
  await stopAgentRuntime()
  await new Promise((resolve) => setTimeout(resolve, 250))
  return true
}

function isAgentRuntimeProbeTimeout(error?: string): boolean {
  return typeof error === 'string' && /timed out after \d+ms/.test(error)
}

function resolveRuntimeTransport(input: { baseURL?: string; transportKind?: AgentRuntimeControlTransportKind; socketPath?: string }): { baseURL: string; transport: AgentRuntimeControlTransport } {
  return resolveAgentRuntimeControlTransportInput(input)
}

function runtimeStatus(
  status: Omit<AgentRuntimeStatus, 'baseURL' | 'transportKind' | 'endpoint' | 'socketPath'>,
  baseURL: string,
  transport: AgentRuntimeControlTransport,
  session?: NonNullable<ReturnType<typeof resolveAgentRuntimeSession>>,
): AgentRuntimeStatus {
  return {
    ...status,
    baseURL,
    transportKind: transport.kind,
    endpoint: transport.endpointLabel,
    ...(transport.socketPath ? { socketPath: transport.socketPath } : {}),
    ...(session ? { workspaceDir: session.workspaceDir, sessionId: session.sessionId } : {}),
  }
}
