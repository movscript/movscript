const DEFAULT_API_ORIGIN = 'http://localhost:8765'
export const APP_SETTINGS_STORAGE_KEY = 'movscript-app-settings'

export interface AppSettings {
  apiBaseURL: string
  showDeveloperTools: boolean
}

export function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export function normalizeAPIBaseURL(value: string): string {
  const trimmed = trimTrailingSlash(value.trim())
  return trimmed.endsWith('/api/v1') ? trimmed.slice(0, -'/api/v1'.length) : trimmed
}

function readStoredAPIBaseURL(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY)
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
  return normalizeAPIBaseURL(import.meta.env.VITE_API_BASE_URL || DEFAULT_API_ORIGIN)
}

export function getAPIBaseURL(): string {
  return readStoredAPIBaseURL() || getDefaultAPIBaseURL()
}

export function getAPIV1BaseURL(): string {
  return `${getAPIBaseURL()}/api/v1`
}

export const API_BASE_URL = getAPIBaseURL()
export const API_V1_BASE_URL = getAPIV1BaseURL()
