export type BrowserStorageArea = 'local' | 'session'

export function readBrowserStorageItem(area: BrowserStorageArea, key: string): string | null {
  try {
    return storageForArea(area)?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function writeBrowserStorageItem(area: BrowserStorageArea, key: string, value: string): void {
  try {
    storageForArea(area)?.setItem(key, value)
  } catch {
    // Browser storage may be unavailable in embedded/private contexts.
  }
}

export function removeBrowserStorageItem(area: BrowserStorageArea, key: string): void {
  try {
    storageForArea(area)?.removeItem(key)
  } catch {
    // Browser storage may be unavailable in embedded/private contexts.
  }
}

function storageForArea(area: BrowserStorageArea): Storage | undefined {
  if (typeof window === 'undefined') return undefined
  return area === 'session' ? window.sessionStorage : window.localStorage
}
