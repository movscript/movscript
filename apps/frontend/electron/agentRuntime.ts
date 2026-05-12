import { execFile, spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import { app } from 'electron'

const DEFAULT_PRODUCTION_RUNTIME_BASE_URL = 'http://127.0.0.1:28765'
const DEFAULT_MCP_ENDPOINT = 'http://127.0.0.1:18765/mcp'
const DEFAULT_BACKEND_API_BASE_URL = 'http://localhost:8765'
const DEFAULT_AGENT_USER_DATA_DIR = 'movscript-agent'
const MIN_AGENT_RUNTIME_API_VERSION = 1
const execFileAsync = promisify(execFile)
export type AgentRuntimeLaunchPolicy = 'spawn' | 'external'

let proc: ChildProcess | null = null
let startPromise: Promise<AgentRuntimeStatus> | null = null
let backendAPIBaseURL = normalizeBackendAPIBaseURL(
  process.env.MOVSCRIPT_BACKEND_API_BASE_URL
    || process.env.MOVSCRIPT_API_BASE_URL
    || process.env.VITE_API_BASE_URL
    || DEFAULT_BACKEND_API_BASE_URL
)
const supportsProcessGroups = process.platform !== 'win32'
const shouldDetachAgentRuntime = app.isPackaged && supportsProcessGroups

export interface AgentRuntimeStatus {
  ok: boolean
  running: boolean
  managed: boolean
  started: boolean
  baseURL: string
  pid?: number
  error?: string
}

export function getAgentRuntimeLaunchPolicy(): AgentRuntimeLaunchPolicy {
  const raw = (process.env.MOVSCRIPT_AGENT_POLICY || '').trim().toLowerCase()
  if (raw === 'external' || raw === 'spawn') return raw
  return 'spawn'
}

interface AgentRuntimeLaunch {
  command: string
  args: string[]
  cwd: string
  env?: Record<string, string>
}

interface AgentRuntimeHealthCheck {
  ok: boolean
  compatible: boolean
  apiVersion?: number
  mcpEndpoint?: string
  reason?:
    | 'fetch-failed'
    | 'health-non-200'
    | 'health-body-not-ok'
    | 'capabilities-non-200'
    | 'capabilities-fetch-failed'
    | 'incompatible-api-version'
    | 'missing-features'
    | 'mcp-endpoint-mismatch'
    | 'mcp-endpoint-missing'
  error?: string
}

function summarizeHealthCheck(health: AgentRuntimeHealthCheck): string {
  const parts: string[] = [
    `ok=${health.ok}`,
    `compatible=${health.compatible}`,
  ]
  if (health.reason) parts.push(`reason=${health.reason}`)
  if (health.apiVersion !== undefined) parts.push(`apiVersion=${health.apiVersion}`)
  if (health.mcpEndpoint) parts.push(`mcpEndpoint=${health.mcpEndpoint}`)
  if (health.error) parts.push(`error=${health.error}`)
  return parts.join(' ')
}

export async function ensureAgentRuntimeRunning(input: { baseURL?: string } = {}): Promise<AgentRuntimeStatus> {
  const baseURL = normalizeBaseURL(input.baseURL)
  const policy = getAgentRuntimeLaunchPolicy()
  const health = await getAgentRuntimeHealth(baseURL)
  if (health.ok && health.compatible) {
    return {
      ok: true,
      running: true,
      managed: proc !== null && !proc.killed,
      started: false,
      baseURL,
      pid: proc?.pid,
    }
  }
  if (policy === 'external') {
    return {
      ok: false,
      running: health.ok,
      managed: false,
      started: false,
      baseURL,
      error: health.error ?? `Agent runtime is not available at ${baseURL}. Start it separately or set MOVSCRIPT_AGENT_POLICY=spawn.`,
    }
  }
  if (health.ok && !health.compatible && health.reason === 'mcp-endpoint-mismatch') {
    const stopped = proc && !proc.killed
      ? await stopManagedIncompatibleRuntime()
      : await stopUnmanagedIncompatibleRuntime(baseURL)
    if (!stopped) {
      return {
        ok: false,
        running: true,
        managed: proc !== null && !proc.killed,
        started: false,
        baseURL,
        error: health.error ?? 'Agent runtime is bound to a stale MCP endpoint and could not be restarted.',
      }
    }
  } else if (health.ok && !health.compatible && proc && !proc.killed) {
    await stopManagedIncompatibleRuntime()
  } else if (health.ok && !health.compatible) {
    return {
      ok: false,
      running: true,
      managed: false,
      started: false,
      baseURL,
      error: health.error ?? 'Agent is running but is not compatible with this desktop app. Stop the old runtime process and restart the desktop app.',
    }
  }

  if (startPromise) return startPromise
  startPromise = startAgentRuntime(baseURL).finally(() => {
    startPromise = null
  })
  return startPromise
}

export async function stopAgentRuntime(): Promise<void> {
  const current = proc
  if (!current) return
  proc = null
  await terminateAgentProcess(current)
}

export async function setAgentRuntimeAPIBaseURL(apiBaseURL: string): Promise<void> {
  const next = normalizeBackendAPIBaseURL(apiBaseURL)
  if (next === backendAPIBaseURL) return
  backendAPIBaseURL = next
  process.env.MOVSCRIPT_BACKEND_API_BASE_URL = next
  process.env.MOVSCRIPT_API_BASE_URL = next
  await stopAgentRuntime()
}

async function startAgentRuntime(baseURL: string): Promise<AgentRuntimeStatus> {
  const spawnStartedAt = Date.now()
  try {
    const launch = resolveAgentRuntimeLaunch()
    const port = resolvePort(baseURL)
    const mcpEndpoint = process.env.MOVSCRIPT_MCP_ENDPOINT || DEFAULT_MCP_ENDPOINT
    const agentUserDataDir = process.env.MOVSCRIPT_AGENT_USER_DATA_DIR || join(app.getPath('userData'), DEFAULT_AGENT_USER_DATA_DIR)
    console.info(`[agent] spawning ${launch.command} ${launch.args.join(' ')} cwd=${launch.cwd}`)
    console.info(`[agent] spawn env MOVSCRIPT_AGENT_PORT=${port} MOVSCRIPT_MCP_ENDPOINT=${mcpEndpoint} MOVSCRIPT_BACKEND_API_BASE_URL=${backendAPIBaseURL || '(unset)'} MOVSCRIPT_AGENT_USER_DATA_DIR=${agentUserDataDir} parentPid=${process.pid}`)
    const child = spawn(launch.command, launch.args, {
      cwd: launch.cwd,
      detached: shouldDetachAgentRuntime,
      env: {
        ...process.env,
        ...launch.env,
        MOVSCRIPT_AGENT_PORT: String(port),
        MOVSCRIPT_MCP_ENDPOINT: mcpEndpoint,
        MOVSCRIPT_AGENT_USER_DATA_DIR: agentUserDataDir,
        ...(backendAPIBaseURL ? {
          MOVSCRIPT_BACKEND_API_BASE_URL: backendAPIBaseURL,
          MOVSCRIPT_API_BASE_URL: backendAPIBaseURL,
        } : {}),
        MOVSCRIPT_AGENT_PARENT_PID: String(process.pid),
      },
      stdio: app.isPackaged ? 'ignore' : 'inherit',
    })
    proc = child
    if (shouldDetachAgentRuntime) child.unref()

    child.on('error', (err) => console.error('[agent]', err))
    child.on('exit', (code, signal) => {
      console.info(`[agent] movscript-agent exited code=${code ?? 'null'} signal=${signal ?? 'null'} pid=${child.pid ?? 'unknown'} elapsedMs=${Date.now() - spawnStartedAt}`)
      if (proc === child) proc = null
    })

    await waitForAgentRuntime(baseURL, 10_000)
    return {
      ok: true,
      running: true,
      managed: true,
      started: true,
      baseURL,
      pid: child.pid,
    }
  } catch (error) {
    if (proc && !proc.killed) await stopAgentRuntime()
    proc = null
    return {
      ok: false,
      running: false,
      managed: false,
      started: false,
      baseURL,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function terminateAgentProcess(child: ChildProcess, signal: NodeJS.Signals = 'SIGTERM'): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return

  let exited = false
  const exitPromise = new Promise<void>((resolve) => {
    child.once('exit', () => {
      exited = true
      resolve()
    })
  })

  try {
    if (shouldDetachAgentRuntime && child.pid) {
      process.kill(-child.pid, signal)
    } else {
      child.kill(signal)
    }
  } catch {
    // The runtime may already be gone when shutdown races with exit handling.
    return
  }

  await Promise.race([
    exitPromise,
    new Promise<void>((resolve) => {
      setTimeout(() => resolve(), 2_000)
    }),
  ])

  if (exited) return

  try {
    if (shouldDetachAgentRuntime && child.pid) {
      process.kill(-child.pid, 'SIGKILL')
    } else {
      child.kill('SIGKILL')
    }
  } catch {
    // If the process disappears between timeout and SIGKILL, shutdown is done.
  }
}

async function stopManagedIncompatibleRuntime(): Promise<boolean> {
  await stopAgentRuntime()
  await new Promise((resolve) => setTimeout(resolve, 250))
  return true
}

async function stopUnmanagedIncompatibleRuntime(baseURL: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseURL}/runtime/shutdown`, { method: 'POST' })
    if (res.ok && await waitForAgentRuntimeToStop(baseURL, 3_000)) return true
  } catch {
    // Older runtimes do not expose /runtime/shutdown; fall back to the port owner.
  }

  if (!await terminateRuntimePortOwner(baseURL)) return false
  return waitForAgentRuntimeToStop(baseURL, 3_000)
}

async function waitForAgentRuntimeToStop(baseURL: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const health = await getAgentRuntimeHealth(baseURL)
    if (!health.ok) return true
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  return false
}

async function terminateRuntimePortOwner(baseURL: string): Promise<boolean> {
  if (process.platform === 'win32') return false
  const port = resolvePort(baseURL)
  let stdout = ''
  try {
    const result = await execFileAsync(resolveLsofCommand(), ['-nP', `-tiTCP:${port}`, '-sTCP:LISTEN'])
    stdout = result.stdout
  } catch {
    return false
  }
  const pids = stdout
    .split(/\s+/)
    .map((item) => Number(item))
    .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid)
  if (pids.length === 0) return false

  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      // The process may have exited after lsof returned it.
    }
  }
  if (await waitForAgentRuntimeToStop(baseURL, 1_500)) return true

  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // The process may have exited after the graceful termination window.
    }
  }
  return true
}

function resolveLsofCommand(): string {
  if (process.platform === 'darwin' && existsSync('/usr/sbin/lsof')) return '/usr/sbin/lsof'
  return 'lsof'
}

function resolveAgentRuntimeLaunch(): AgentRuntimeLaunch {
  const roots = [
    join(app.getAppPath(), '..', 'agent'),
    join(process.cwd(), '..', 'agent'),
    join(process.cwd(), 'apps', 'agent'),
    join(process.resourcesPath || '', 'movscript-agent'),
  ]

  for (const root of roots) {
    const bundledServer = join(root, 'dist', 'server.bundle.js')
    if (app.isPackaged && existsSync(bundledServer)) {
      return {
        command: process.execPath,
        args: [bundledServer],
        cwd: join(app.getPath('userData'), DEFAULT_AGENT_USER_DATA_DIR),
        env: { ELECTRON_RUN_AS_NODE: '1' },
      }
    }

    const distServer = join(root, 'dist', 'server.js')
    if (app.isPackaged && existsSync(distServer)) {
      return {
        command: process.execPath,
        args: [distServer],
        cwd: join(app.getPath('userData'), DEFAULT_AGENT_USER_DATA_DIR),
        env: { ELECTRON_RUN_AS_NODE: '1' },
      }
    }

    const packageJSON = join(root, 'package.json')
    if (!app.isPackaged && existsSync(packageJSON)) {
      return {
        command: process.execPath,
        args: ['scripts/dev-watch.mjs'],
        cwd: root,
        env: { ELECTRON_RUN_AS_NODE: '1' },
      }
    }

    if (existsSync(distServer)) {
      return {
        command: process.execPath,
        args: [distServer],
        cwd: root,
        env: { ELECTRON_RUN_AS_NODE: '1' },
      }
    }
  }

  throw new Error('movscript-agent not found. Expected apps/agent in development or resources/movscript-agent/dist/server.js in packaged builds.')
}

async function waitForAgentRuntime(baseURL: string, timeoutMs: number): Promise<void> {
  const startedAt = Date.now()
  const deadline = startedAt + timeoutMs
  let lastHealth: AgentRuntimeHealthCheck = { ok: false, compatible: false, reason: 'fetch-failed', error: 'no health probe yet' }
  let lastProgressLogAt = 0
  while (Date.now() < deadline) {
    const health = await getAgentRuntimeHealth(baseURL)
    if (health.ok && health.compatible) {
      console.info(`[agent] health ok at ${baseURL} after ${Date.now() - startedAt}ms`)
      return
    }
    lastHealth = health
    const now = Date.now()
    if (now - lastProgressLogAt >= 1000) {
      lastProgressLogAt = now
      console.info(`[agent] still waiting for runtime at ${baseURL} (elapsed=${now - startedAt}ms, ${summarizeHealthCheck(health)})`)
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`movscript-agent did not become compatible at ${baseURL} within ${timeoutMs}ms; last health: ${summarizeHealthCheck(lastHealth)}`)
}

async function getAgentRuntimeHealth(baseURL: string): Promise<AgentRuntimeHealthCheck> {
  let res: Response
  try {
    res = await fetch(`${baseURL}/health`)
  } catch (error) {
    return {
      ok: false,
      compatible: false,
      reason: 'fetch-failed',
      error: describeFetchError(error),
    }
  }
  if (!res.ok) {
    return {
      ok: false,
      compatible: false,
      reason: 'health-non-200',
      error: `GET ${baseURL}/health returned HTTP ${res.status}`,
    }
  }
  let body: { ok?: unknown; runtime?: { apiVersion?: unknown; features?: unknown } }
  try {
    body = await res.json() as typeof body
  } catch (error) {
    return {
      ok: false,
      compatible: false,
      reason: 'health-non-200',
      error: `GET ${baseURL}/health returned invalid JSON: ${describeFetchError(error)}`,
    }
  }
  if (body.ok !== true) {
    return {
      ok: false,
      compatible: false,
      reason: 'health-body-not-ok',
      error: `GET ${baseURL}/health body did not report ok=true`,
    }
  }
  let capabilityRes: Response
  try {
    capabilityRes = await fetch(`${baseURL}/runtime/capabilities`)
  } catch (error) {
    return {
      ok: true,
      compatible: false,
      reason: 'capabilities-fetch-failed',
      error: `GET ${baseURL}/runtime/capabilities failed: ${describeFetchError(error)}`,
    }
  }
  if (!capabilityRes.ok) {
    return {
      ok: true,
      compatible: false,
      reason: 'capabilities-non-200',
      error: `GET ${baseURL}/runtime/capabilities returned HTTP ${capabilityRes.status}`,
    }
  }
  const capabilities = await capabilityRes.json() as { runtime?: { apiVersion?: unknown; features?: unknown }; mcpEndpoint?: unknown }
  const runtime = capabilities.runtime ?? body.runtime
  const apiVersion = typeof runtime?.apiVersion === 'number' ? runtime.apiVersion : undefined
  const features = Array.isArray(runtime?.features) ? runtime.features : []
  const mcpEndpoint = typeof capabilities.mcpEndpoint === 'string' ? capabilities.mcpEndpoint.trim() : ''
  const hasRequiredFeatures = features.includes('model-config') && features.includes('runtime-capabilities')
  if (!apiVersion || apiVersion < MIN_AGENT_RUNTIME_API_VERSION) {
    return {
      ok: true,
      compatible: false,
      apiVersion,
      reason: 'incompatible-api-version',
      error: `apiVersion=${apiVersion ?? 'unset'} but required apiVersion>=${MIN_AGENT_RUNTIME_API_VERSION}`,
    }
  }
  if (!hasRequiredFeatures) {
    return {
      ok: true,
      compatible: false,
      apiVersion,
      reason: 'missing-features',
      error: `runtime features ${JSON.stringify(features)} missing model-config and/or runtime-capabilities`,
    }
  }
  const expectedMcpEndpoint = (process.env.MOVSCRIPT_MCP_ENDPOINT || DEFAULT_MCP_ENDPOINT).replace(/\/+$/, '')
  if (mcpEndpoint && mcpEndpoint !== expectedMcpEndpoint) {
    return {
      ok: true,
      compatible: false,
      apiVersion,
      mcpEndpoint,
      reason: 'mcp-endpoint-mismatch',
      error: `Agent runtime is bound to ${mcpEndpoint} but expected ${expectedMcpEndpoint}. Restart the agent after MCP changes.`,
    }
  }
  if (!mcpEndpoint) {
    return {
      ok: true,
      compatible: false,
      apiVersion,
      reason: 'mcp-endpoint-missing',
      error: 'Agent runtime did not report its MCP endpoint.',
    }
  }
  return { ok: true, compatible: true, apiVersion, mcpEndpoint }
}

function describeFetchError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const parts: string[] = [error.message]
  const anyError = error as Error & { code?: unknown; cause?: unknown }
  if (typeof anyError.code === 'string') parts.push(`code=${anyError.code}`)
  if (anyError.cause && typeof anyError.cause === 'object') {
    const cause = anyError.cause as { code?: unknown; address?: unknown; port?: unknown; syscall?: unknown }
    if (typeof cause.code === 'string') parts.push(`causeCode=${cause.code}`)
    if (typeof cause.syscall === 'string') parts.push(`syscall=${cause.syscall}`)
    if (typeof cause.address === 'string') parts.push(`address=${cause.address}`)
    if (typeof cause.port === 'number' || typeof cause.port === 'string') parts.push(`port=${cause.port}`)
  }
  return parts.join(' ')
}

function normalizeBaseURL(value?: string): string {
  return (value || DEFAULT_PRODUCTION_RUNTIME_BASE_URL).replace(/\/+$/, '')
}

function resolvePort(baseURL: string): number {
  const url = new URL(baseURL)
  return Number(url.port || 28765)
}

function normalizeBackendAPIBaseURL(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  return trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`
}
