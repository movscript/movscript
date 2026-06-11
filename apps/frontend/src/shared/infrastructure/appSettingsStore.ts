import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  APP_SETTINGS_STORAGE_KEY,
  getDefaultAPIBaseURL,
  getLocalAPIBaseURL,
  normalizeAPIBaseURL,
  type AppSettings,
} from '@/shared/infrastructure/config'
import type { ShotLibrarySourceConfig } from '@/shared/contracts/appSettings'
import { normalizeAppSettings } from '@movscript/core/shared'

interface AppSettingsStore {
  settings: AppSettings
  savedAt: string | null
  hydrated: boolean
  completeOnboarding: (settings: Partial<AppSettings>) => void
  setOnboardingSettings: (settings: Partial<AppSettings>) => void
  setLaunchMode: (launchMode: AppSettings['launchMode']) => void
  setWorkMode: (workMode: AppSettings['workMode']) => void
  setAPIBaseURL: (apiBaseURL: string) => void
  setMovScriptWorkspaceDir: (workspaceDir: string) => void
  setShotLibrarySources: (sources: ShotLibrarySourceConfig[], defaultSourceId?: string) => void
  reset: () => void
}

const defaultSettings: AppSettings = {
  apiBaseURL: getDefaultAPIBaseURL(),
  launchMode: 'cloud',
  workMode: 'detail',
  onboardingCompleted: false,
}

function normalizeSettings(settings?: Partial<AppSettings> | null): AppSettings {
  return normalizeAppSettings(settings, {
    defaultSettings,
    localAPIBaseURL: getLocalAPIBaseURL(),
  })
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
      setOnboardingSettings: (partial) => {
        const current = useAppSettingsStore.getState().settings
        const next = normalizeSettings({
          ...current,
          ...partial,
          onboardingCompleted: partial.onboardingCompleted ?? current.onboardingCompleted,
        })
        set({ settings: next, savedAt: new Date().toISOString() })
        syncElectronSettings(next)
      },
      setLaunchMode: (launchMode) => {
        const current = useAppSettingsStore.getState().settings
        const currentAPIBaseURL = normalizeAPIBaseURL(current.apiBaseURL)
        const localAPIBaseURL = getLocalAPIBaseURL()
        const next = normalizeSettings({
          ...current,
          launchMode,
          apiBaseURL: launchMode === 'local'
            ? localAPIBaseURL
            : currentAPIBaseURL === localAPIBaseURL
              ? getDefaultAPIBaseURL()
              : current.apiBaseURL,
        })
        set({ settings: next, savedAt: new Date().toISOString() })
        syncElectronSettings(next)
      },
      setWorkMode: (workMode) => {
        const next = normalizeSettings({ ...useAppSettingsStore.getState().settings, workMode })
        set({ settings: next, savedAt: new Date().toISOString() })
        syncElectronSettings(next)
      },
      setAPIBaseURL: (apiBaseURL) => {
        const next = normalizeSettings({ ...useAppSettingsStore.getState().settings, apiBaseURL })
        set({ settings: next, savedAt: new Date().toISOString() })
        syncElectronSettings(next)
      },
      setMovScriptWorkspaceDir: (movScriptWorkspaceDir) => {
        const next = normalizeSettings({ ...useAppSettingsStore.getState().settings, movScriptWorkspaceDir })
        set({ settings: next, savedAt: new Date().toISOString() })
        syncElectronSettings(next)
      },
      setShotLibrarySources: (shotLibrarySources, defaultShotLibrarySourceId) => {
        const next = normalizeSettings({
          ...useAppSettingsStore.getState().settings,
          shotLibrarySources,
          defaultShotLibrarySourceId,
        })
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
