import { spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const DEFAULT_PRODUCTION_RUNTIME_BASE_URL = 'http://127.0.0.1:28765'
const DEFAULT_MCP_ENDPOINT = 'http://127.0.0.1:18765/mcp'
const DEFAULT_AGENT_USER_DATA_DIR = 'movscript-agent'
const MIN_AGENT_RUNTIME_API_VERSION = 1

let proc: ChildProcess | null = null
let startPromise: Promise<AgentRuntimeStatus> | null = null
let backendAPIBaseURL = normalizeBackendAPIBaseURL(process.env.MOVSCRIPT_BACKEND_API_BASE_URL || process.env.MOVSCRIPT_API_BASE_URL || '')
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
  error?: string
}

export async function ensureAgentRuntimeRunning(input: { baseURL?: string } = {}): Promise<AgentRuntimeStatus> {
  const baseURL = normalizeBaseURL(input.baseURL)
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
  if (health.ok && !health.compatible && proc && !proc.killed) {
    await stopAgentRuntime()
    await new Promise((resolve) => setTimeout(resolve, 250))
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
  try {
    const launch = resolveAgentRuntimeLaunch()
    const port = resolvePort(baseURL)
    console.info(`[agent] spawning ${launch.command} ${launch.args.join(' ')} cwd=${launch.cwd}`)
    const child = spawn(launch.command, launch.args, {
      cwd: launch.cwd,
      detached: shouldDetachAgentRuntime,
      env: {
        ...process.env,
        ...launch.env,
        MOVSCRIPT_AGENT_PORT: String(port),
        MOVSCRIPT_MCP_ENDPOINT: process.env.MOVSCRIPT_MCP_ENDPOINT || DEFAULT_MCP_ENDPOINT,
        MOVSCRIPT_AGENT_USER_DATA_DIR: process.env.MOVSCRIPT_AGENT_USER_DATA_DIR || join(app.getPath('userData'), DEFAULT_AGENT_USER_DATA_DIR),
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
      console.info(`[agent] movscript-agent exited code=${code ?? 'null'} signal=${signal ?? 'null'}`)
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
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const health = await getAgentRuntimeHealth(baseURL)
    if (health.ok && health.compatible) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`movscript-agent did not become compatible at ${baseURL} within ${timeoutMs}ms`)
}

async function getAgentRuntimeHealth(baseURL: string): Promise<AgentRuntimeHealthCheck> {
  try {
    const res = await fetch(`${baseURL}/health`)
    if (!res.ok) return { ok: false, compatible: false }
    const body = await res.json() as { ok?: unknown; runtime?: { apiVersion?: unknown; features?: unknown } }
    if (body.ok !== true) return { ok: false, compatible: false }
    const capabilityRes = await fetch(`${baseURL}/runtime/capabilities`)
    if (!capabilityRes.ok) {
      return {
        ok: true,
        compatible: false,
        error: 'Agent is running but does not expose /runtime/capabilities.',
      }
    }
    const capabilities = await capabilityRes.json() as { runtime?: { apiVersion?: unknown; features?: unknown }; mcpEndpoint?: unknown }
    const runtime = capabilities.runtime ?? body.runtime
    const apiVersion = typeof runtime?.apiVersion === 'number' ? runtime.apiVersion : undefined
    const features = Array.isArray(runtime?.features) ? runtime.features : []
    const mcpEndpoint = typeof capabilities.mcpEndpoint === 'string' ? capabilities.mcpEndpoint.trim() : ''
    const hasRequiredFeatures = features.includes('model-config') && features.includes('runtime-capabilities')
    if (!apiVersion || apiVersion < MIN_AGENT_RUNTIME_API_VERSION || !hasRequiredFeatures) {
      return {
        ok: true,
        compatible: false,
        apiVersion,
        error: `Agent runtime is incompatible. Required apiVersion>=${MIN_AGENT_RUNTIME_API_VERSION} with model-config/runtime-capabilities features.`,
      }
    }
    const expectedMcpEndpoint = (process.env.MOVSCRIPT_MCP_ENDPOINT || DEFAULT_MCP_ENDPOINT).replace(/\/+$/, '')
    if (mcpEndpoint && mcpEndpoint !== expectedMcpEndpoint) {
      return {
        ok: true,
        compatible: false,
        apiVersion,
        mcpEndpoint,
        error: `Agent runtime is bound to ${mcpEndpoint} but expected ${expectedMcpEndpoint}. Restart the agent after MCP changes.`,
      }
    }
    if (!mcpEndpoint) {
      return {
        ok: true,
        compatible: false,
        apiVersion,
        error: 'Agent runtime did not report its MCP endpoint.',
      }
    }
    return { ok: true, compatible: true, apiVersion, mcpEndpoint }
  } catch {
    return { ok: false, compatible: false }
  }
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
