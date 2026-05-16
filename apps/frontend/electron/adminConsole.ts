import { LOCAL_BACKEND_URL } from './backendConstants'

export function resolveAdminConsoleURL(input?: { baseURL?: string; path?: string }): string {
  const baseURL = normalizeBackendBaseURL(input?.baseURL?.trim() || LOCAL_BACKEND_URL)
  const normalizedPath = normalizeAdminConsolePath(input?.path ?? '')
  const url = new URL(`${baseURL}/admin${normalizedPath}`)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Admin console URL must use http or https')
  }
  return url.toString()
}

export function normalizeAdminConsolePath(path: string): string {
  const trimmed = path.trim().replace(/^\/+/, '')
  if (!trimmed || trimmed === 'admin') return ''
  const withoutAdminPrefix = trimmed.startsWith('admin/') ? trimmed.slice('admin/'.length) : trimmed
  return `/${withoutAdminPrefix}`
}

function normalizeBackendBaseURL(baseURL: string): string {
  const trimmed = baseURL.replace(/\/+$/, '')
  return trimmed.endsWith('/api/v1') ? trimmed.slice(0, -'/api/v1'.length) : trimmed
}
