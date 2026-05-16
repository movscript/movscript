import { normalizeAPIBaseURL } from '@/lib/config'

export function adminConsoleURL(baseURL: string, path = ''): string {
  const base = normalizeAPIBaseURL(baseURL)
  const adminPath = normalizeAdminPath(path)
  return `${base}/admin${adminPath}`
}

export async function openAdminConsole(baseURL: string, path = ''): Promise<void> {
  if (typeof window === 'undefined') return
  if (window.api?.openAdminConsole) {
    await window.api.openAdminConsole({ baseURL, path })
    return
  }
  window.open(adminConsoleURL(baseURL, path), '_blank', 'noopener,noreferrer')
}

function normalizeAdminPath(path: string): string {
  const trimmed = path.trim().replace(/^\/+/, '')
  if (!trimmed || trimmed === 'admin') return ''
  const withoutAdminPrefix = trimmed.startsWith('admin/') ? trimmed.slice('admin/'.length) : trimmed
  return `/${withoutAdminPrefix}`
}
