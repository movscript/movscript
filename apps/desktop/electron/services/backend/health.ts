import { platform } from 'node:os'

export async function isBackendReady(baseURL: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseURL.replace(/\/+$/, '')}/health`, { cache: 'no-store' })
    return response.ok
  } catch {
    return false
  }
}

export async function waitForBackendReady(baseURL: string, pid?: number, options: { timeoutMs?: number; intervalMs?: number } = {}): Promise<void> {
  const timeoutMs = options.timeoutMs ?? Number(process.env.MOVSCRIPT_BACKEND_READY_TIMEOUT_MS || 60_000)
  const intervalMs = options.intervalMs ?? 500
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (pid && !isProcessRunning(pid)) {
      throw new Error('Local backend process exited before it became ready')
    }
    if (await isBackendReady(baseURL)) return
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error(`Timed out waiting ${timeoutMs}ms for local backend readiness at ${baseURL}`)
}

export function isProcessRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
    if (code === 'EPERM') return true
    if (platform() === 'win32' && code === 'EINVAL') return false
    return false
  }
}
