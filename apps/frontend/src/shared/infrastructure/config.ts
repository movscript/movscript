import type { AppSettings } from '@/shared/contracts/appSettings'
import type { ElectronRuntimeConfig } from '@/shared/contracts/electronApi'
import { readBrowserStorageItem } from '@/shared/infrastructure/browserStorage'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import {
  isLocalLaunchMode,
  normalizeAPIBaseURL,
  trimTrailingSlash,
} from '@movscript/core/shared'

const DEFAULT_API_ORIGIN = 'http://localhost:8765'
const LOCAL_API_ORIGIN = 'http://localhost:8766'
export const APP_SETTINGS_STORAGE_KEY = 'movscript-app-settings'
let runtimeConfigSnapshot: ElectronRuntimeConfig | null = null

export type { AppSettings }
export { isLocalLaunchMode, normalizeAPIBaseURL, trimTrailingSlash }

function readStoredAPIBaseURL(): string | null {
  try {
    const raw = readBrowserStorageItem('local', APP_SETTINGS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AppSettings> & {
      state?: { settings?: Partial<AppSettings> }
      settings?: Partial<AppSettings>
    }
    const settings = parsed.state?.settings ?? parsed.settings ?? parsed
    return typeof settings.apiBaseURL === 'string' && settings.apiBaseURL.trim()
      ? normalizeAPIBaseURL(settings.apiBaseURL)
      : null
  } catch {
    return null
  }
}

export function getDefaultAPIBaseURL(): string {
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
    return normalizeAPIBaseURL(window.location.origin)
  }
  return normalizeAPIBaseURL(readImportMetaEnv().VITE_API_BASE_URL || DEFAULT_API_ORIGIN)
}

export function getLocalAPIBaseURL(): string {
  return normalizeAPIBaseURL(readImportMetaEnv().VITE_LOCAL_API_BASE_URL || LOCAL_API_ORIGIN)
}

export function getAPIBaseURL(): string {
  return runtimeConfigSnapshot?.apiBaseURL || readStoredAPIBaseURL() || getDefaultAPIBaseURL()
}

export function getAPIV1BaseURL(): string {
  return runtimeConfigSnapshot?.apiV1BaseURL || `${getAPIBaseURL()}/api/v1`
}

export function getRuntimeConfigSnapshot(): ElectronRuntimeConfig | null {
  return runtimeConfigSnapshot
}

export function setRuntimeConfigSnapshot(snapshot: ElectronRuntimeConfig | null | undefined): void {
  runtimeConfigSnapshot = snapshot ? normalizeRuntimeConfigSnapshot(snapshot) : null
}

export async function refreshRuntimeConfigSnapshot(): Promise<ElectronRuntimeConfig | null> {
  const api = readElectronApi()
  if (!api?.getRuntimeConfig) return runtimeConfigSnapshot
  const snapshot = await api.getRuntimeConfig()
  setRuntimeConfigSnapshot(snapshot)
  return runtimeConfigSnapshot
}

function readImportMetaEnv(): Record<string, string | undefined> {
  return (import.meta as { env?: Record<string, string | undefined> }).env ?? {}
}

function normalizeRuntimeConfigSnapshot(snapshot: ElectronRuntimeConfig): ElectronRuntimeConfig {
  const apiBaseURL = normalizeAPIBaseURL(snapshot.apiBaseURL)
  const localAPIBaseURL = normalizeAPIBaseURL(snapshot.localAPIBaseURL)
  return {
    ...snapshot,
    movScriptHomeDir: snapshot.movScriptHomeDir?.trim() || snapshot.workspaceDir.trim(),
    workspaceDir: snapshot.workspaceDir.trim(),
    apiBaseURL,
    apiV1BaseURL: snapshot.apiV1BaseURL?.trim() ? normalizeAPIBaseURL(snapshot.apiV1BaseURL) + '/api/v1' : `${apiBaseURL}/api/v1`,
    localAPIBaseURL,
    providerRuntimeEnv: normalizeProviderRuntimeEnv(snapshot.providerRuntimeEnv),
    backendStatus: {
      ...snapshot.backendStatus,
      baseURL: normalizeAPIBaseURL(snapshot.backendStatus.baseURL),
    },
  }
}

function normalizeProviderRuntimeEnv(env: ElectronRuntimeConfig['providerRuntimeEnv'] | undefined): Record<string, string> | undefined {
  if (!env || typeof env !== 'object') return undefined
  const output: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    const normalizedKey = key.trim().toUpperCase()
    const normalizedValue = value?.trim()
    if (/^[A-Z_][A-Z0-9_]*$/.test(normalizedKey) && normalizedValue) output[normalizedKey] = normalizedValue
  }
  return Object.keys(output).length > 0 ? output : undefined
}
