import { spawn, ChildProcess } from 'child_process'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
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

  const existingPid = proc?.pid ?? readBackendPid()
  if (existingPid && isProcessRunning(existingPid)) {
    if (await isBackendReady(LOCAL_BACKEND_URL)) {
      return setBackendStatus({ state: 'ready', baseURL: LOCAL_BACKEND_URL, pid: existingPid }, onStatus)
    }
    if (startPromise) return startPromise
    startPromise = waitForExistingBackend(existingPid, onStatus).finally(() => {
      startPromise = null
    })
    return startPromise
  }

  clearBackendPid()
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
    detached: true,
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
    stdio: 'ignore',
  })
  proc.unref()
  if (proc.pid) writeBackendPid(proc.pid)

  proc.on('error', (err) => console.error('[backend]', err))
  proc.on('exit', (code, signal) => {
    console.info(`[backend] exited code=${code ?? 'null'} signal=${signal ?? 'null'}`)
    proc = null
    clearBackendPid()
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

async function waitForExistingBackend(pid: number, onStatus?: (status: BackendStatus) => void): Promise<BackendStatus> {
  setBackendStatus({ state: 'starting', baseURL: LOCAL_BACKEND_URL, pid, message: 'Local backend process is starting' }, onStatus)
  try {
    await waitForBackendReady(LOCAL_BACKEND_URL, pid)
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

function resolveBackendPidPath(): string {
  return join(resolveLocalDataDir(), 'movscript-backend.pid')
}

function readBackendPid(): number | undefined {
  try {
    const raw = readFileSync(resolveBackendPidPath(), 'utf8').trim()
    const pid = Number(raw)
    return Number.isInteger(pid) && pid > 0 ? pid : undefined
  } catch {
    return undefined
  }
}

function writeBackendPid(pid: number): void {
  const pidPath = resolveBackendPidPath()
  mkdirSync(join(pidPath, '..'), { recursive: true })
  writeFileSync(pidPath, String(pid), 'utf8')
}

function clearBackendPid(): void {
  try {
    unlinkSync(resolveBackendPidPath())
  } catch {
    // Missing pid files are expected after manual cleanup or first launch.
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function isBackendReady(baseURL: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseURL}/health`, { cache: 'no-store' })
    return response.ok
  } catch {
    return false
  }
}

async function waitForBackendReady(baseURL: string, pid?: number): Promise<void> {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (pid && !isProcessRunning(pid)) {
      clearBackendPid()
      throw new Error('Local backend process exited before it became ready')
    }
    if (await isBackendReady(baseURL)) return
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`Timed out waiting for ${baseURL}`)
}

export async function stopBackend(
  onStatus?: (status: BackendStatus) => void,
  options: { terminate?: boolean } = {},
): Promise<void> {
  const pid = proc?.pid ?? readBackendPid()
  proc = null
  if (pid && isProcessRunning(pid)) {
    if (options.terminate) {
      try {
        process.kill(pid)
      } catch {
        // If the process disappears between detection and termination, treat it as stopped.
      }
      clearBackendPid()
      setBackendStatus({ state: 'stopped', baseURL: LOCAL_BACKEND_URL }, onStatus)
      return
    }
    setBackendStatus({ state: 'ready', baseURL: LOCAL_BACKEND_URL, pid, message: 'Local backend keeps running in the background' }, onStatus)
    return
  }
  clearBackendPid()
  setBackendStatus({ state: 'stopped', baseURL: LOCAL_BACKEND_URL }, onStatus)
}
