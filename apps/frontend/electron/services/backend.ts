import type { ChildProcess } from 'child_process'
import { app } from 'electron'
import { LOCAL_BACKEND_PORT, LOCAL_BACKEND_URL } from './backend/constants'
import { isBackendReady, isProcessRunning, waitForBackendReady } from './backend/health'
import { clearBackendPid, readBackendPid } from './backend/pid'
import { getBackendLaunchPolicy } from './backend/policy'
import { spawnBackendProcess } from './backend/spawn'
import { formatBackendStartupFailure, type BackendExitInfo } from './backend/diagnostics'
import type { BackendLaunchPolicy, BackendStatus, BackendStatusListener } from './backend/types'

let proc: ChildProcess | null = null
let startPromise: Promise<BackendStatus> | null = null
const BACKEND_GRACEFUL_STOP_TIMEOUT_MS = 10_000

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
  const spawned = spawnBackendProcess()
  const { child, diagnostics } = spawned
  proc = child
  let exitInfo: BackendExitInfo | undefined

  child.on('error', (err) => console.error('[backend]', err))
  child.on('exit', (code, signal) => {
    exitInfo = { code, signal }
    console.info(`[backend] exited code=${code ?? 'null'} signal=${signal ?? 'null'}`)
    if (proc === child) proc = null
    clearBackendPid()
    const recentOutput = diagnostics.recentOutput().trim()
    setBackendStatus({
      state: code === 0 || signal ? 'stopped' : 'error',
      baseURL: LOCAL_BACKEND_URL,
      message: code === 0 || signal ? undefined : `Local backend exited with code ${code ?? 'null'}`,
      logPath: diagnostics.logPath,
      recentOutput: recentOutput || undefined,
    }, onStatus)
  })

  try {
    await waitForBackendReady(LOCAL_BACKEND_URL, child.pid)
    const status: BackendStatus = { state: 'ready', baseURL: LOCAL_BACKEND_URL, pid: child.pid }
    return setBackendStatus(status, onStatus)
  } catch (error) {
    const message = formatBackendStartupFailure({ error, diagnostics, exitInfo })
    const recentOutput = diagnostics.recentOutput().trim()
    const status: BackendStatus = {
      state: 'error',
      baseURL: LOCAL_BACKEND_URL,
      pid: child.pid,
      message,
      logPath: diagnostics.logPath,
      recentOutput: recentOutput || undefined,
    }
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
  const child = proc
  const pid = proc?.pid ?? readBackendPid()
  proc = null
  if (pid && isProcessRunning(pid)) {
    if (options.terminate || !app.isPackaged) {
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        // If the process disappears between detection and termination, treat it as stopped.
      }
      try {
        await waitForBackendExit({ pid, child, timeoutMs: BACKEND_GRACEFUL_STOP_TIMEOUT_MS })
      } catch (error) {
        console.warn('[backend] graceful stop timed out; forcing process termination', error)
        try {
          if (isProcessRunning(pid)) process.kill(pid, 'SIGKILL')
        } catch {
          // If the process disappears between detection and force-kill, treat it as stopped.
        }
        await waitForBackendExit({ pid, child, timeoutMs: 1_000 }).catch(() => undefined)
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

function waitForBackendExit(input: {
  pid: number
  child: ChildProcess | null
  timeoutMs: number
}): Promise<void> {
  const { pid, child, timeoutMs } = input
  if (!isProcessRunning(pid)) return Promise.resolve()
  if (child && child.exitCode !== null) return Promise.resolve()
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>
    let poll: ReturnType<typeof setInterval> | undefined
    const cleanup = () => {
      clearTimeout(timer)
      if (poll) clearInterval(poll)
      child?.off('exit', onExit)
      child?.off('error', onError)
    }
    const onExit = () => {
      cleanup()
      resolve()
    }
    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }
    const checkProcess = () => {
      if (isProcessRunning(pid)) return
      cleanup()
      resolve()
    }
    timer = setTimeout(() => {
      cleanup()
      reject(new Error(`timed out waiting ${timeoutMs}ms for backend process exit`))
    }, timeoutMs)
    child?.once('exit', onExit)
    child?.once('error', onError)
    poll = setInterval(checkProcess, 200)
    checkProcess()
  })
}
