import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  APP_SETTINGS_STORAGE_KEY,
  getDefaultAPIBaseURL,
  normalizeAPIBaseURL,
  type AppSettings,
} from '@/lib/config'

interface AppSettingsStore {
  settings: AppSettings
  savedAt: string | null
  setAPIBaseURL: (apiBaseURL: string) => void
  reset: () => void
}

const defaultSettings: AppSettings = {
  apiBaseURL: getDefaultAPIBaseURL(),
}

function syncElectronSettings(settings: AppSettings): void {
  if (typeof window === 'undefined') return
  void window.api?.setAppSettings?.(settings)
}

export const useAppSettingsStore = create<AppSettingsStore>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      savedAt: null,
      setAPIBaseURL: (apiBaseURL) => {
        const next = { apiBaseURL: normalizeAPIBaseURL(apiBaseURL) }
        set({ settings: next, savedAt: new Date().toISOString() })
        syncElectronSettings(next)
      },
      reset: () => {
        set({ settings: defaultSettings, savedAt: new Date().toISOString() })
        syncElectronSettings(defaultSettings)
      },
    }),
    {
      name: APP_SETTINGS_STORAGE_KEY,
      partialize: (state) => ({ settings: state.settings, savedAt: state.savedAt }),
      onRehydrateStorage: () => (state) => {
        if (state) syncElectronSettings(state.settings)
      },
    }
  )
)
