import type { ChildProcess } from 'child_process'
import { app } from 'electron'
import { LOCAL_BACKEND_PORT, LOCAL_BACKEND_URL } from './backend/constants'
import { isBackendReady, isProcessRunning, waitForBackendReady } from './backend/health'
import { clearBackendPid, readBackendPid } from './backend/pid'
import { getBackendLaunchPolicy } from './backend/policy'
import { spawnBackendProcess } from './backend/spawn'
import type { BackendLaunchPolicy, BackendStatus, BackendStatusListener } from './backend/types'

let proc: ChildProcess | null = null
let startPromise: Promise<BackendStatus> | null = null

export { LOCAL_BACKEND_PORT, LOCAL_BACKEND_URL }
export { getBackendLaunchPolicy }
export type { BackendLaunchPolicy, BackendStatus }

let currentStatus: BackendStatus = { state: 'idle', baseURL: LOCAL_BACKEND_URL }

export function getBackendStatus(): BackendStatus {
  return currentStatus
}

function setBackendStatus(status: BackendStatus, onStatus?: BackendStatusListener): BackendStatus {
  currentStatus = status
  onStatus?.(status)
  return status
}

export async function startBackend(
  policy: BackendLaunchPolicy = getBackendLaunchPolicy(),
  onStatus?: BackendStatusListener,
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

async function spawnBackend(onStatus?: BackendStatusListener): Promise<BackendStatus> {
  setBackendStatus({ state: 'starting', baseURL: LOCAL_BACKEND_URL, message: 'Starting local backend' }, onStatus)
  const child = spawnBackendProcess()
  proc = child

  child.on('error', (err) => console.error('[backend]', err))
  child.on('exit', (code, signal) => {
    console.info(`[backend] exited code=${code ?? 'null'} signal=${signal ?? 'null'}`)
    if (proc === child) proc = null
    clearBackendPid()
    setBackendStatus({
      state: code === 0 || signal ? 'stopped' : 'error',
      baseURL: LOCAL_BACKEND_URL,
      message: code === 0 || signal ? undefined : `Local backend exited with code ${code ?? 'null'}`,
    }, onStatus)
  })

  try {
    await waitForBackendReady(LOCAL_BACKEND_URL, child.pid)
    const status: BackendStatus = { state: 'ready', baseURL: LOCAL_BACKEND_URL, pid: child.pid }
    return setBackendStatus(status, onStatus)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Local backend failed to start'
    const status: BackendStatus = { state: 'error', baseURL: LOCAL_BACKEND_URL, pid: child.pid, message }
    return setBackendStatus(status, onStatus)
  }
}

async function waitForExistingBackend(pid: number, onStatus?: BackendStatusListener): Promise<BackendStatus> {
  setBackendStatus({ state: 'starting', baseURL: LOCAL_BACKEND_URL, pid, message: 'Local backend process is starting' }, onStatus)
  try {
    await waitForBackendReady(LOCAL_BACKEND_URL, pid)
    return setBackendStatus({ state: 'ready', baseURL: LOCAL_BACKEND_URL, pid }, onStatus)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Local backend failed to start'
    return setBackendStatus({ state: 'error', baseURL: LOCAL_BACKEND_URL, pid, message }, onStatus)
  }
}

export async function stopBackend(
  onStatus?: BackendStatusListener,
  options: { terminate?: boolean } = {},
): Promise<void> {
  const pid = proc?.pid ?? readBackendPid()
  proc = null
  if (pid && isProcessRunning(pid)) {
    if (options.terminate || !app.isPackaged) {
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
