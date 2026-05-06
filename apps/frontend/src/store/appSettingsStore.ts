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
  completeOnboarding: (settings: Partial<AppSettings>) => void
  setLaunchMode: (launchMode: AppSettings['launchMode']) => void
  setAPIBaseURL: (apiBaseURL: string) => void
  setShowDeveloperTools: (showDeveloperTools: boolean) => void
  reset: () => void
}

const defaultSettings: AppSettings = {
  apiBaseURL: getDefaultAPIBaseURL(),
  launchMode: 'cloud',
  onboardingCompleted: false,
  showDeveloperTools: false,
}

function normalizeSettings(settings?: Partial<AppSettings> | null): AppSettings {
  return {
    ...defaultSettings,
    ...settings,
    launchMode: settings?.launchMode === 'local' ? 'local' : 'cloud',
    onboardingCompleted: settings?.onboardingCompleted ?? defaultSettings.onboardingCompleted,
    localDisplayName: settings?.localDisplayName?.trim() || undefined,
    apiBaseURL: normalizeAPIBaseURL(settings?.apiBaseURL || defaultSettings.apiBaseURL),
    showDeveloperTools: settings?.showDeveloperTools ?? defaultSettings.showDeveloperTools,
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
        const next = normalizeSettings({ ...useAppSettingsStore.getState().settings, launchMode })
        set({ settings: next, savedAt: new Date().toISOString() })
        syncElectronSettings(next)
      },
      setAPIBaseURL: (apiBaseURL) => {
        const next = normalizeSettings({ ...useAppSettingsStore.getState().settings, apiBaseURL })
        set({ settings: next, savedAt: new Date().toISOString() })
        syncElectronSettings(next)
      },
      setShowDeveloperTools: (showDeveloperTools) => {
        const next = normalizeSettings({ ...useAppSettingsStore.getState().settings, showDeveloperTools })
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
        }
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return
        state.settings = normalizeSettings(state.settings)
        syncElectronSettings(state.settings)
      },
    }
  )
)
