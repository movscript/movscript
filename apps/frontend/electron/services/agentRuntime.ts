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
  resolveAgentRuntimeControlTransportInput,
  type AgentRuntimeControlTransport,
  type AgentRuntimeControlTransportKind,
} from './agentRuntime/transport'

export { getAgentRuntimeLaunchPolicy } from './agentRuntime/config'

installAgentLogTimestamps('main')

let proc: ChildProcess | null = null
let startPromise: Promise<AgentRuntimeStatus> | null = null
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
  pid?: number
  error?: string
}

export async function ensureAgentRuntimeRunning(input: { baseURL?: string; transportKind?: AgentRuntimeControlTransportKind; socketPath?: string } = {}): Promise<AgentRuntimeStatus> {
  const startedAt = Date.now()
  const { baseURL, transport } = resolveRuntimeTransport(input)
  const policy = readAgentRuntimeLaunchPolicy()
  console.info(`[agent] ensure runtime start transport=${transport.kind} endpoint=${transport.endpointLabel} policy=${policy}`)
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
  if (health.ok && !health.compatible && health.reason === 'mcp-endpoint-mismatch') {
    const stopped = proc && !proc.killed
      ? await stopManagedIncompatibleRuntime()
      : await stopUnmanagedIncompatibleRuntime(transport)
    if (!stopped) {
      return runtimeStatus({
        ok: false,
        running: true,
        managed: proc !== null && !proc.killed,
        started: false,
        error: health.error ?? 'Agent runtime is bound to a stale MCP endpoint and could not be restarted.',
      }, baseURL, transport)
    }
  } else if (health.ok && !health.compatible && proc && !proc.killed) {
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
): AgentRuntimeStatus {
  return {
    ...status,
    baseURL,
    transportKind: transport.kind,
    endpoint: transport.endpointLabel,
    ...(transport.socketPath ? { socketPath: transport.socketPath } : {}),
  }
}
