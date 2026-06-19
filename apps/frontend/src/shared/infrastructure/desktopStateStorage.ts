import type { StateStorage } from 'zustand/middleware'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'

export function createDesktopStateStorage(key: string, fallback: StateStorage): StateStorage<Promise<unknown> | void> {
  return {
    getItem: async (name) => {
      const api = readElectronApi()
      if (!api?.getDesktopState) return fallback.getItem(name)
      try {
        const result = await api.getDesktopState({ key })
        if (typeof result.value === 'string') {
          await fallback.removeItem(name)
          return result.value
        }
        const legacy = await fallback.getItem(name)
        if (legacy !== null && api.setDesktopState) {
          await api.setDesktopState({ key, value: legacy })
          await fallback.removeItem(name)
        }
        return legacy
      } catch {
        return fallback.getItem(name)
      }
    },
    setItem: async (name, value) => {
      const api = readElectronApi()
      if (!api?.setDesktopState) return fallback.setItem(name, value)
      try {
        await api.setDesktopState({ key, value })
        await fallback.removeItem(name)
      } catch {
        await fallback.setItem(name, value)
      }
    },
    removeItem: async (name) => {
      const api = readElectronApi()
      if (api?.removeDesktopState) {
        try {
          await api.removeDesktopState({ key })
        } catch {
          // Keep browser cleanup best-effort even if the desktop bridge fails.
        }
      }
      await fallback.removeItem(name)
    },
  }
}
