import { spawn, ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join, resolve } from 'path'
import { app } from 'electron'
import { createHash } from 'crypto'

let proc: ChildProcess | null = null
let startPromise: Promise<BackendStatus> | null = null
export type BackendLaunchPolicy = 'external' | 'spawn' | 'cloud'

export interface BackendStatus {
  state: 'idle' | 'starting' | 'ready' | 'error' | 'stopped'
  baseURL: string
  pid?: number
  message?: string
}

export const LOCAL_BACKEND_PORT = '8766'
export const LOCAL_BACKEND_URL = `http://localhost:${LOCAL_BACKEND_PORT}`

let currentStatus: BackendStatus = { state: 'idle', baseURL: LOCAL_BACKEND_URL }

export function getBackendStatus(): BackendStatus {
  return currentStatus
}

function setBackendStatus(status: BackendStatus, onStatus?: (status: BackendStatus) => void): BackendStatus {
  currentStatus = status
  onStatus?.(status)
  return status
}

export function getBackendLaunchPolicy(): BackendLaunchPolicy {
  const raw = process.env.MOVSCRIPT_BACKEND_POLICY?.trim()
  if (raw === 'external' || raw === 'spawn' || raw === 'cloud') return raw
  return process.env.NODE_ENV === 'development' ? 'external' : 'cloud'
}

export async function startBackend(
  policy: BackendLaunchPolicy = getBackendLaunchPolicy(),
  onStatus?: (status: BackendStatus) => void,
): Promise<BackendStatus> {
  if (policy !== 'spawn') {
    console.info(`[backend] launch policy=${policy}; not spawning local backend`)
    return setBackendStatus({ state: 'idle', baseURL: LOCAL_BACKEND_URL }, onStatus)
  }
  if (proc) {
    if (currentStatus.state === 'ready') {
      const status: BackendStatus = { state: 'ready', baseURL: LOCAL_BACKEND_URL, pid: proc.pid }
      return setBackendStatus(status, onStatus)
    }
    if (startPromise) return startPromise
    startPromise = waitForExistingBackend(onStatus).finally(() => {
      startPromise = null
    })
    return startPromise
  }

  if (startPromise) return startPromise

  startPromise = spawnBackend(onStatus).finally(() => {
    startPromise = null
  })
  return startPromise
}

async function spawnBackend(onStatus?: (status: BackendStatus) => void): Promise<BackendStatus> {
  const bin = resolveBackendBinary()
  const adminDir = resolveAdminDir()
  const dataDir = resolveLocalDataDir()
  const localSecret = resolveLocalSecret(dataDir)
  setBackendStatus({ state: 'starting', baseURL: LOCAL_BACKEND_URL, message: 'Starting local backend' }, onStatus)
  proc = spawn(bin, [], {
    cwd: resolveBackendCwd(bin),
    env: {
      ...process.env,
      MOVSCRIPT_APP_MODE: process.env.MOVSCRIPT_APP_MODE || 'local',
      MOVSCRIPT_ADMIN_DIR: process.env.MOVSCRIPT_ADMIN_DIR || adminDir,
      MOVSCRIPT_DATA_DIR: process.env.MOVSCRIPT_DATA_DIR || dataDir,
      SERVER_PORT: process.env.SERVER_PORT || LOCAL_BACKEND_PORT,
      DB_DRIVER: process.env.DB_DRIVER || 'sqlite',
      DB_PATH: process.env.DB_PATH || join(dataDir, 'movscript-frontend.db'),
      STORAGE_BACKEND: process.env.STORAGE_BACKEND || 'filesystem',
      FILESYSTEM_STORAGE_ROOT: process.env.FILESYSTEM_STORAGE_ROOT || join(dataDir, 'resources'),
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || localSecret,
      AUTH_TOKEN_SECRET: process.env.AUTH_TOKEN_SECRET || localSecret,
    },
    stdio: 'inherit'
  })

  proc.on('error', (err) => console.error('[backend]', err))
  proc.on('exit', (code, signal) => {
    console.info(`[backend] exited code=${code ?? 'null'} signal=${signal ?? 'null'}`)
    proc = null
    setBackendStatus({
      state: code === 0 || signal ? 'stopped' : 'error',
      baseURL: LOCAL_BACKEND_URL,
      message: code === 0 || signal ? undefined : `Local backend exited with code ${code ?? 'null'}`,
    }, onStatus)
  })

  try {
    await waitForBackendReady(LOCAL_BACKEND_URL)
    const status: BackendStatus = { state: 'ready', baseURL: LOCAL_BACKEND_URL, pid: proc.pid }
    return setBackendStatus(status, onStatus)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Local backend failed to start'
    const status: BackendStatus = { state: 'error', baseURL: LOCAL_BACKEND_URL, pid: proc.pid, message }
    return setBackendStatus(status, onStatus)
  }
}

async function waitForExistingBackend(onStatus?: (status: BackendStatus) => void): Promise<BackendStatus> {
  const pid = proc?.pid
  setBackendStatus({ state: 'starting', baseURL: LOCAL_BACKEND_URL, pid, message: 'Waiting for local backend' }, onStatus)
  try {
    await waitForBackendReady(LOCAL_BACKEND_URL)
    return setBackendStatus({ state: 'ready', baseURL: LOCAL_BACKEND_URL, pid }, onStatus)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Local backend failed to start'
    return setBackendStatus({ state: 'error', baseURL: LOCAL_BACKEND_URL, pid, message }, onStatus)
  }
}

function resolveBackendBinary(): string {
  const envPath = process.env.MOVSCRIPT_BACKEND_BIN?.trim()
  if (envPath) return envPath

  const binary = process.platform === 'win32' ? 'server.exe' : 'server'
  const candidates = app.isPackaged
    ? [
        join(process.resourcesPath, 'backend', binary),
        join(app.getAppPath(), '..', 'backend', binary),
      ]
    : [
        resolve(process.cwd(), '../backend/bin', binary),
        resolve(process.cwd(), '../../apps/backend/bin', binary),
      ]

  const found = candidates.find((candidate) => existsSync(candidate))
  if (found) return found
  return candidates[0]
}

function resolveBackendCwd(binaryPath: string): string {
  if (app.isPackaged) return join(binaryPath, '..')
  return resolve(process.cwd(), '../backend')
}

function resolveAdminDir(): string {
  const envPath = process.env.MOVSCRIPT_ADMIN_DIR?.trim()
  if (envPath) return envPath
  if (app.isPackaged) return join(process.resourcesPath, 'backend', 'admin')
  return resolve(process.cwd(), '../admin/dist')
}

function resolveLocalDataDir(): string {
  return process.env.MOVSCRIPT_DATA_DIR?.trim() || join(app.getPath('userData'), 'local-backend')
}

function resolveLocalSecret(dataDir: string): string {
  const seed = `${app.getPath('userData')}:${dataDir}:movscript-local-backend`
  return createHash('sha256').update(seed).digest('hex')
}

async function waitForBackendReady(baseURL: string): Promise<void> {
  const deadline = Date.now() + 12000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseURL}/health`, { cache: 'no-store' })
      if (response.ok) return
    } catch {
      // keep polling while the backend initializes sqlite and migrations
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`Timed out waiting for ${baseURL}`)
}

export async function stopBackend(onStatus?: (status: BackendStatus) => void): Promise<void> {
  if (proc) {
    proc.kill()
    proc = null
  }
  setBackendStatus({ state: 'stopped', baseURL: LOCAL_BACKEND_URL }, onStatus)
}
