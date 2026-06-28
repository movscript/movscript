import {
  getSettingsDaemonGatewayBaseURL,
  isLocalDataConnection,
  normalizeAPIBaseURL,
  refreshRuntimeConfigSnapshot,
  type AppSettings,
} from '@/shared/infrastructure/config'
import { useAppSettingsStore } from '@/shared/infrastructure/appSettingsStore'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'

export type BackendBootState = 'idle' | 'starting' | 'ready' | 'error' | 'stopped'

export interface BackendBootStatus {
  state: BackendBootState
  baseURL: string
  pid?: number
  message?: string
  logPath?: string
  recentOutput?: string
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
const LOCAL_BACKEND_HEALTH_TIMEOUT_MS = 1_500

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
  if (!readElectronApi()?.getBackendStatus || !readElectronApi()?.setAppSettings) return false
  const settings = useAppSettingsStore.getState().settings
  if (!settings.onboardingCompleted) return false
  return shouldUseLocalDaemonGateway(settings)
}

export function shouldUseLocalDaemonGateway(settings: Pick<AppSettings, 'dataConnection'> | null | undefined): boolean {
  return isLocalDataConnection(settings)
}

export function getLocalDaemonGatewayBaseURL(
  settings: Pick<AppSettings, 'daemonGatewayBaseURL' | 'dataConnection' | 'apiBaseURL'> | null | undefined,
): string {
  return getSettingsDaemonGatewayBaseURL(settings)
}

export function canManageLocalBackend(): boolean {
  if (typeof window === 'undefined') return false
  return !!readElectronApi()?.getBackendStatus && !!readElectronApi()?.setAppSettings
}

export async function probeLocalBackendStatus(baseURL: string): Promise<BackendBootStatus> {
  const normalized = normalizeAPIBaseURL(baseURL)
  if (await isLocalBackendHTTPReady(normalized)) {
    return { state: 'ready', baseURL: normalized }
  }
  return {
    state: 'error',
    baseURL: normalized,
    message: `Local runtime data plane is not reachable at ${normalized}.`,
  }
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
  const api = readElectronApi()
  if (!api?.getBackendStatus || !api?.setAppSettings) return
  const getBackendStatus = api.getBackendStatus
  const setAppSettings = api.setAppSettings

  const settings = useAppSettingsStore.getState().settings
  const localDaemonGatewayBaseURL = getLocalDaemonGatewayBaseURL(settings)
  const initial = await getBackendStatus().catch(() => null)
  if (isBackendBootStatus(initial)) {
    if (initial.state === 'ready') {
      await refreshRuntimeConfigSnapshot().catch(() => null)
      return
    }
    if (initial.state === 'error') {
      throw new BackendBootError(initial.message || 'Local runtime failed to start.', initial)
    }
  }
  if (await isLocalBackendHTTPReady(isBackendBootStatus(initial) ? initial.baseURL : localDaemonGatewayBaseURL)) return

  await setAppSettings(settings).catch((error) => {
    throw new BackendBootError(error instanceof Error ? error.message : String(error))
  })

  const afterStart = await getBackendStatus().catch(() => null)
  if (isBackendBootStatus(afterStart)) {
    if (afterStart.state === 'ready') {
      await refreshRuntimeConfigSnapshot().catch(() => null)
      return
    }
    if (afterStart.state === 'error') {
      throw new BackendBootError(afterStart.message || 'Local runtime failed to start.', afterStart)
    }
  }
  if (await isLocalBackendHTTPReady(isBackendBootStatus(afterStart) ? afterStart.baseURL : localDaemonGatewayBaseURL)) return

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
        void refreshRuntimeConfigSnapshot().catch(() => null).then(() => {
          finish(resolve)
        })
      } else if (next.state === 'starting' || next.state === 'idle' || next.state === 'stopped') {
        void isLocalBackendHTTPReady(next.baseURL || localDaemonGatewayBaseURL).then((ready) => {
          if (ready) finish(resolve)
        })
      } else if (next.state === 'error') {
        finish(() => reject(new BackendBootError(next.message || 'Local runtime failed to start.', next)))
      }
    })
    const timer = window.setTimeout(() => {
      void getBackendStatus().catch(() => null).then((latest) => {
        if (isBackendBootStatus(latest) && latest.state === 'ready') {
          void refreshRuntimeConfigSnapshot().catch(() => null).then(() => finish(resolve))
          return
        }
        finish(() => reject(new BackendBootError(`Timed out waiting for local runtime daemon gateway at ${localDaemonGatewayBaseURL}.`)))
      })
    }, timeoutMs)
  })
}

async function isLocalBackendHTTPReady(baseURL: string): Promise<boolean> {
  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => {
    if (!controller.signal.aborted) controller.abort()
  }, LOCAL_BACKEND_HEALTH_TIMEOUT_MS)
  try {
    const response = await fetch(`${normalizeAPIBaseURL(baseURL)}/health`, {
      cache: 'no-store',
      signal: controller.signal,
    })
    return response.ok
  } catch {
    return false
  } finally {
    globalThis.clearTimeout(timer)
  }
}
