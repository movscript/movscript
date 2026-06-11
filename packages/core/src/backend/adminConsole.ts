export interface ResolveAdminConsoleURLInput {
  baseURL: string
  path?: string
}

export function resolveAdminConsoleURL(input: ResolveAdminConsoleURLInput): string {
  const baseURL = normalizeAdminConsoleBaseURL(input.baseURL)
  const normalizedPath = normalizeAdminConsolePath(input.path ?? '')
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

export function normalizeAdminConsoleBaseURL(baseURL: string): string {
  const trimmed = baseURL.trim().replace(/\/+$/, '')
  return trimmed.endsWith('/api/v1') ? trimmed.slice(0, -'/api/v1'.length) : trimmed
}
