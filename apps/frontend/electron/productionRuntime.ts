import { spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

const DEFAULT_PRODUCTION_RUNTIME_BASE_URL = 'http://127.0.0.1:28765'
const DEFAULT_MCP_ENDPOINT = 'http://127.0.0.1:18765/mcp'

let proc: ChildProcess | null = null
let startPromise: Promise<ProductionRuntimeStatus> | null = null

export interface ProductionRuntimeStatus {
  ok: boolean
  running: boolean
  managed: boolean
  started: boolean
  baseURL: string
  pid?: number
  error?: string
}

interface ProductionRuntimeLaunch {
  command: string
  args: string[]
  cwd: string
  env?: Record<string, string>
}

export async function ensureProductionRuntimeRunning(input: { baseURL?: string } = {}): Promise<ProductionRuntimeStatus> {
  const baseURL = normalizeBaseURL(input.baseURL)
  if (await isProductionRuntimeHealthy(baseURL)) {
    return {
      ok: true,
      running: true,
      managed: proc !== null && !proc.killed,
      started: false,
      baseURL,
      pid: proc?.pid,
    }
  }

  if (startPromise) return startPromise
  startPromise = startProductionRuntime(baseURL).finally(() => {
    startPromise = null
  })
  return startPromise
}

export async function stopProductionRuntime(): Promise<void> {
  if (!proc) return
  proc.kill()
  proc = null
}

async function startProductionRuntime(baseURL: string): Promise<ProductionRuntimeStatus> {
  try {
    const launch = resolveProductionRuntimeLaunch()
    const port = resolvePort(baseURL)
    proc = spawn(launch.command, launch.args, {
      cwd: launch.cwd,
      env: {
        ...process.env,
        ...launch.env,
        MOVSCRIPT_AGENT_PORT: String(port),
        MOVSCRIPT_MCP_ENDPOINT: process.env.MOVSCRIPT_MCP_ENDPOINT || DEFAULT_MCP_ENDPOINT,
      },
      stdio: app.isPackaged ? 'ignore' : 'inherit',
    })

    proc.on('error', (err) => console.error('[production-runtime]', err))
    proc.on('exit', (code, signal) => {
      console.info(`[production-runtime] movscript-production-runtime exited code=${code ?? 'null'} signal=${signal ?? 'null'}`)
      proc = null
    })

    await waitForProductionRuntime(baseURL, 10_000)
    return {
      ok: true,
      running: true,
      managed: true,
      started: true,
      baseURL,
      pid: proc?.pid,
    }
  } catch (error) {
    if (proc && !proc.killed) proc.kill()
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

function resolveProductionRuntimeLaunch(): ProductionRuntimeLaunch {
  const roots = [
    join(app.getAppPath(), '..', 'production-runtime'),
    join(process.cwd(), '..', 'production-runtime'),
    join(process.cwd(), 'apps', 'production-runtime'),
    join(process.resourcesPath || '', 'movscript-production-runtime'),
  ]

  for (const root of roots) {
    const distServer = join(root, 'dist', 'server.js')
    if (app.isPackaged && existsSync(distServer)) {
      return {
        command: process.execPath,
        args: [distServer],
        cwd: root,
        env: { ELECTRON_RUN_AS_NODE: '1' },
      }
    }

    const packageJSON = join(root, 'package.json')
    if (!app.isPackaged && existsSync(packageJSON)) {
      return {
        command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
        args: ['run', 'dev'],
        cwd: root,
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

  throw new Error('movscript-production-runtime not found. Expected apps/production-runtime in development or resources/movscript-production-runtime/dist/server.js in packaged builds.')
}

async function waitForProductionRuntime(baseURL: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isProductionRuntimeHealthy(baseURL)) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`movscript-production-runtime did not become healthy at ${baseURL}/health within ${timeoutMs}ms`)
}

async function isProductionRuntimeHealthy(baseURL: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseURL}/health`)
    if (!res.ok) return false
    const body = await res.json() as { ok?: unknown }
    return body.ok === true
  } catch {
    return false
  }
}

function normalizeBaseURL(value?: string): string {
  return (value || DEFAULT_PRODUCTION_RUNTIME_BASE_URL).replace(/\/+$/, '')
}

function resolvePort(baseURL: string): number {
  const url = new URL(baseURL)
  return Number(url.port || 28765)
}
