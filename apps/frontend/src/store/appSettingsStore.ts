import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  APP_SETTINGS_STORAGE_KEY,
  getDefaultAPIBaseURL,
  getLocalAPIBaseURL,
  normalizeAPIBaseURL,
  type AppSettings,
} from '@/lib/config'

interface AppSettingsStore {
  settings: AppSettings
  savedAt: string | null
  hydrated: boolean
  completeOnboarding: (settings: Partial<AppSettings>) => void
  setLaunchMode: (launchMode: AppSettings['launchMode']) => void
  setAPIBaseURL: (apiBaseURL: string) => void
  reset: () => void
}

const defaultSettings: AppSettings = {
  apiBaseURL: getDefaultAPIBaseURL(),
  launchMode: 'cloud',
  onboardingCompleted: false,
}

function normalizeSettings(settings?: Partial<AppSettings> | null): AppSettings {
  return {
    ...defaultSettings,
    ...settings,
    launchMode: settings?.launchMode === 'local' ? 'local' : 'cloud',
    onboardingCompleted: settings?.onboardingCompleted ?? defaultSettings.onboardingCompleted,
    localDisplayName: settings?.localDisplayName?.trim() || undefined,
    apiBaseURL: normalizeAPIBaseURL(settings?.apiBaseURL || (settings?.launchMode === 'local' ? getLocalAPIBaseURL() : defaultSettings.apiBaseURL)),
  }
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
      hydrated: false,
      completeOnboarding: (partial) => {
        const next = normalizeSettings({
          ...useAppSettingsStore.getState().settings,
          ...partial,
          onboardingCompleted: true,
        })
        set({ settings: next, savedAt: new Date().toISOString() })
        syncElectronSettings(next)
      },
      setLaunchMode: (launchMode) => {
        const current = useAppSettingsStore.getState().settings
        const next = normalizeSettings({
          ...current,
          launchMode,
          apiBaseURL: launchMode === 'local' ? getLocalAPIBaseURL() : current.apiBaseURL,
        })
        set({ settings: next, savedAt: new Date().toISOString() })
        syncElectronSettings(next)
      },
      setAPIBaseURL: (apiBaseURL) => {
        const next = normalizeSettings({ ...useAppSettingsStore.getState().settings, apiBaseURL })
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
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<AppSettingsStore> | undefined
        const settings = normalizeSettings(persisted?.settings)
        return {
          ...currentState,
          ...persisted,
          settings,
          hydrated: true,
        }
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return
        state.settings = normalizeSettings(state.settings)
        state.hydrated = true
        syncElectronSettings(state.settings)
      },
    }
  )
)
