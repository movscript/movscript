import { resolveAdminConsoleURL } from '@movscript/core/backend'

export function adminConsoleURL(baseURL: string, path = ''): string {
  return resolveAdminConsoleURL({ baseURL, path })
}

export async function openAdminConsole(baseURL: string, path = ''): Promise<void> {
  if (typeof window === 'undefined') return
  if (window.api?.openAdminConsole) {
    await window.api.openAdminConsole({ baseURL, path })
    return
  }
  window.open(adminConsoleURL(baseURL, path), '_blank', 'noopener,noreferrer')
}
