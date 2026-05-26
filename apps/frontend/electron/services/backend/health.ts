import { clearBackendPid } from './pid'

export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export async function isBackendReady(baseURL: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseURL}/health`, { cache: 'no-store' })
    return response.ok
  } catch {
    return false
  }
}

export async function waitForBackendReady(baseURL: string, pid?: number): Promise<void> {
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
