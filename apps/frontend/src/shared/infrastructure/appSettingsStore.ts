import { create } from 'zustand'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import { persist } from 'zustand/middleware'
import {
  APP_SETTINGS_STORAGE_KEY,
  getDefaultAPIBaseURL,
  getLocalAPIBaseURL,
  normalizeAPIBaseURL,
  refreshRuntimeConfigSnapshot,
  type AppSettings,
} from '@/shared/infrastructure/config'
import type { ShotLibrarySourceConfig } from '@/shared/contracts/appSettings'
import type { ElectronAppSettingsSecrets } from '@/shared/contracts/electronApi'
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
  workMode: 'project',
  onboardingCompleted: true,
}

function normalizeSettings(settings?: Partial<AppSettings> | null): AppSettings {
  return normalizeAppSettings(settings, {
    defaultSettings,
    localAPIBaseURL: getLocalAPIBaseURL(),
  })
}

export async function saveElectronAppSettings(settings: AppSettings): Promise<void> {
  if (typeof window === 'undefined') return
  await readElectronApi()?.setAppSettings?.(settings)
  await refreshRuntimeConfigSnapshot().catch(() => null)
}

function syncElectronSettings(settings: AppSettings): void {
  void saveElectronAppSettings(settings)
}

export function sanitizeAppSettingsForPersistence(settings: AppSettings): AppSettings {
  return {
    ...settings,
    shotLibrarySources: settings.shotLibrarySources?.map((source) => ({
      id: source.id,
      name: source.name,
      baseURL: source.baseURL,
      enabled: source.enabled,
      readOnly: source.readOnly,
    })),
  }
}

export function mergeAppSettingsSecrets(settings: AppSettings, secrets: ElectronAppSettingsSecrets): AppSettings {
  if (!settings.shotLibrarySources?.length) return settings
  const shotLibrarySources = settings.shotLibrarySources.map((source) => {
    const authToken = secrets.shotLibrarySourceAuthTokens[source.id]?.trim()
    return authToken ? { ...source, authToken } : source
  })
  return normalizeSettings({ ...settings, shotLibrarySources })
}

async function hydrateElectronAppSettingsSecrets(): Promise<void> {
  const api = readElectronApi()
  if (!api?.getAppSettingsSecrets) return
  const secrets = await api.getAppSettingsSecrets()
  const current = useAppSettingsStore.getState().settings
  const next = mergeAppSettingsSecrets(current, secrets)
  useAppSettingsStore.setState({ settings: next })
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
      partialize: (state) => ({ settings: sanitizeAppSettingsForPersistence(state.settings), savedAt: state.savedAt }),
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
        void hydrateElectronAppSettingsSecrets()
          .then(() => syncElectronSettings(useAppSettingsStore.getState().settings))
          .catch(() => null)
      },
    }
  )
)
