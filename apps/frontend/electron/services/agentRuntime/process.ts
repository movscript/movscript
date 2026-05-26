import { execFile, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { promisify } from 'util'
import { resolvePort } from './config'
import { waitForAgentRuntimeToStop } from './health'

const execFileAsync = promisify(execFile)

const supportsProcessGroups = process.platform !== 'win32'

export function shouldDetachAgentRuntimeProcess(isPackaged: boolean): boolean {
  return isPackaged && supportsProcessGroups
}

export async function terminateAgentProcess(
  child: ChildProcess,
  input: { detachedProcessGroup: boolean; signal?: NodeJS.Signals },
): Promise<void> {
  const signal = input.signal ?? 'SIGTERM'
  if (child.exitCode !== null || child.signalCode !== null) return

  let exited = false
  const exitPromise = new Promise<void>((resolve) => {
    child.once('exit', () => {
      exited = true
      resolve()
    })
  })

  try {
    if (input.detachedProcessGroup && child.pid) {
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
    if (input.detachedProcessGroup && child.pid) {
      process.kill(-child.pid, 'SIGKILL')
    } else {
      child.kill('SIGKILL')
    }
  } catch {
    // If the process disappears between timeout and SIGKILL, shutdown is done.
  }
}

export async function stopUnmanagedIncompatibleRuntime(baseURL: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseURL}/runtime/shutdown`, { method: 'POST' })
    if (res.ok && await waitForAgentRuntimeToStop(baseURL, 3_000)) return true
  } catch {
    // Older runtimes do not expose /runtime/shutdown; fall back to the port owner.
  }

  if (!await terminateRuntimePortOwner(baseURL)) return false
  return waitForAgentRuntimeToStop(baseURL, 3_000)
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
