import { getLocalAPIBaseURL, isLocalLaunchMode, normalizeAPIBaseURL } from '@/lib/config'
import { useAppSettingsStore } from '@/store/appSettingsStore'

export type BackendBootState = 'idle' | 'starting' | 'ready' | 'error' | 'stopped'

export interface BackendBootStatus {
  state: BackendBootState
  baseURL: string
  pid?: number
  message?: string
}

export class BackendBootError extends Error {
  readonly status?: BackendBootStatus

  constructor(message: string, status?: BackendBootStatus) {
    super(message)
    this.name = 'BackendBootError'
    this.status = status
  }
}

let readyPromise: Promise<void> | null = null

export function isBackendBootError(error: unknown): error is BackendBootError {
  return error instanceof BackendBootError || (
    !!error
    && typeof error === 'object'
    && (error as { name?: unknown }).name === 'BackendBootError'
  )
}

export function isBackendBootStatus(value: unknown): value is BackendBootStatus {
  if (!value || typeof value !== 'object') return false
  const status = value as Partial<BackendBootStatus>
  return status.state === 'idle'
    || status.state === 'starting'
    || status.state === 'ready'
    || status.state === 'error'
    || status.state === 'stopped'
}

export function shouldGateLocalBackendRequests(): boolean {
  if (typeof window === 'undefined') return false
  if (!window.api?.getBackendStatus || !window.api?.setAppSettings) return false
  const settings = useAppSettingsStore.getState().settings
  if (!isLocalLaunchMode(settings)) return false
  return normalizeAPIBaseURL(settings.apiBaseURL) === getLocalAPIBaseURL()
}

export async function waitForLocalBackendReady(timeoutMs = 20_000): Promise<void> {
  if (!shouldGateLocalBackendRequests()) return
  if (!readyPromise) {
    readyPromise = waitForLocalBackendReadyOnce(timeoutMs).finally(() => {
      readyPromise = null
    })
  }
  return readyPromise
}

async function waitForLocalBackendReadyOnce(timeoutMs: number): Promise<void> {
  const api = window.api
  if (!api?.getBackendStatus || !api?.setAppSettings) return

  const settings = useAppSettingsStore.getState().settings
  const initial = await api.getBackendStatus().catch(() => null)
  if (isBackendBootStatus(initial)) {
    if (initial.state === 'ready') return
    if (initial.state === 'error') {
      throw new BackendBootError(initial.message || 'Local backend failed to start.', initial)
    }
  }

  await api.setAppSettings(settings).catch((error) => {
    throw new BackendBootError(error instanceof Error ? error.message : String(error))
  })

  const afterStart = await api.getBackendStatus().catch(() => null)
  if (isBackendBootStatus(afterStart)) {
    if (afterStart.state === 'ready') return
    if (afterStart.state === 'error') {
      throw new BackendBootError(afterStart.message || 'Local backend failed to start.', afterStart)
    }
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      off?.()
      fn()
    }
    const off = api.onBackendStatus?.((next) => {
      if (!isBackendBootStatus(next)) return
      if (next.state === 'ready') {
        finish(resolve)
      } else if (next.state === 'error') {
        finish(() => reject(new BackendBootError(next.message || 'Local backend failed to start.', next)))
      }
    })
    const timer = window.setTimeout(() => {
      finish(() => reject(new BackendBootError(`Timed out waiting for local backend at ${settings.apiBaseURL}.`)))
    }, timeoutMs)
  })
}
