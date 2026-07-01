export function canOpenAdminConsole(): boolean {
  return true
}

export async function openAdminConsole(path = ''): Promise<void> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  window.location.assign(`/admin${normalizedPath}`)
}
