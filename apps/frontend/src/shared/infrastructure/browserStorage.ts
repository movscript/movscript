type BrowserStorageArea = 'local' | 'session'

export function readBrowserStorageItem(area: BrowserStorageArea, key: string): string | null {
  const storage = browserStorageForArea(area)
  if (!storage) return null
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

export function writeBrowserStorageItem(area: BrowserStorageArea, key: string, value: string): void {
  const storage = browserStorageForArea(area)
  if (!storage) return
  try {
    storage.setItem(key, value)
  } catch {
    // Browser storage can be unavailable in restricted contexts.
  }
}

export function removeBrowserStorageItem(area: BrowserStorageArea, key: string): void {
  const storage = browserStorageForArea(area)
  if (!storage) return
  try {
    storage.removeItem(key)
  } catch {
    // Browser storage can be unavailable in restricted contexts.
  }
}

function browserStorageForArea(area: BrowserStorageArea): Storage | undefined {
  if (typeof window === 'undefined') return undefined
  return area === 'local' ? window.localStorage : window.sessionStorage
}
