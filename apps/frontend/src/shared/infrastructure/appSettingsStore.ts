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

interface AppSettingsStore {
  settings: AppSettings
  savedAt: string | null
  hydrated: boolean
  completeOnboarding: (settings: Partial<AppSettings>) => void
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
  const apiBaseURL = normalizeAPIBaseURL(settings?.apiBaseURL || (settings?.launchMode === 'local' ? getLocalAPIBaseURL() : defaultSettings.apiBaseURL))
  const shotLibrarySources = normalizeShotLibrarySources(settings?.shotLibrarySources, apiBaseURL)
  const defaultShotLibrarySourceId = normalizeDefaultShotLibrarySourceId(settings?.defaultShotLibrarySourceId, shotLibrarySources)
  return {
    ...defaultSettings,
    ...settings,
    launchMode: settings?.launchMode === 'local' ? 'local' : 'cloud',
    workMode: settings?.workMode === 'agent' ? 'agent' : 'detail',
    onboardingCompleted: settings?.onboardingCompleted ?? defaultSettings.onboardingCompleted,
    movScriptWorkspaceDir: settings?.movScriptWorkspaceDir?.trim() || undefined,
    localDisplayName: settings?.localDisplayName?.trim() || undefined,
    apiBaseURL,
    shotLibrarySources,
    defaultShotLibrarySourceId,
  }
}

function normalizeShotLibrarySources(sources: ShotLibrarySourceConfig[] | undefined, apiBaseURL: string): ShotLibrarySourceConfig[] {
  const defaultSource = defaultShotLibrarySource(apiBaseURL)
  const normalized = Array.isArray(sources)
    ? sources
        .map(normalizeShotLibrarySource)
        .filter((source): source is ShotLibrarySourceConfig => !!source)
    : []
  const withoutDuplicateIds = new Map<string, ShotLibrarySourceConfig>()
  for (const source of normalized) {
    withoutDuplicateIds.set(source.id, source)
  }
  if (!withoutDuplicateIds.has(defaultSource.id)) {
    withoutDuplicateIds.set(defaultSource.id, defaultSource)
  } else {
    const current = withoutDuplicateIds.get(defaultSource.id)!
    withoutDuplicateIds.set(defaultSource.id, {
      ...defaultSource,
      ...current,
      baseURL: current.baseURL || defaultSource.baseURL,
      name: current.name || defaultSource.name,
    })
  }
  return Array.from(withoutDuplicateIds.values())
}

function normalizeShotLibrarySource(source: Partial<ShotLibrarySourceConfig> | null | undefined): ShotLibrarySourceConfig | null {
  if (!source?.id?.trim() || !source.name?.trim() || !source.baseURL?.trim()) return null
  return {
    id: source.id.trim(),
    name: source.name.trim(),
    baseURL: normalizeAPIBaseURL(source.baseURL),
    enabled: source.enabled !== false,
    readOnly: source.readOnly === true,
    authToken: source.authToken?.trim() || undefined,
  }
}

function defaultShotLibrarySource(apiBaseURL: string): ShotLibrarySourceConfig {
  return {
    id: 'default',
    name: 'Movscript',
    baseURL: apiBaseURL,
    enabled: true,
    readOnly: false,
  }
}

function normalizeDefaultShotLibrarySourceId(defaultSourceId: string | undefined, sources: ShotLibrarySourceConfig[]): string | undefined {
  const enabledSources = sources.filter(source => source.enabled !== false)
  if (defaultSourceId && enabledSources.some(source => source.id === defaultSourceId)) return defaultSourceId
  return enabledSources[0]?.id
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
