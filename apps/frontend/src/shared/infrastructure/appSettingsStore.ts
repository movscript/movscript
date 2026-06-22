import { create } from 'zustand'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import i18n, { isSupportedLanguage, type SupportedLanguage } from '@/i18n'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@/shared/infrastructure/browserStorage'
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
  setLanguage: (language: SupportedLanguage) => void
  setAPIBaseURL: (apiBaseURL: string) => void
  setMovScriptWorkspaceDir: (workspaceDir: string) => void
  setShotLibrarySources: (sources: ShotLibrarySourceConfig[], defaultSourceId?: string) => void
  reset: () => void
}

const defaultSettings: AppSettings = {
  apiBaseURL: getDefaultAPIBaseURL(),
  cloudAPIBaseURL: getDefaultAPIBaseURL(),
  localAPIBaseURL: getLocalAPIBaseURL(),
  launchMode: 'cloud',
  workMode: 'project',
  language: isSupportedLanguage(i18n.language) ? i18n.language : undefined,
  onboardingCompleted: false,
}

let applyingExternalSettings = false
let appSettingsUpdateListenerInstalled = false

const appSettingsBrowserStorage: StateStorage = {
  getItem: (key) => readBrowserStorageItem('local', key),
  setItem: (key, value) => {
    if (isElectronAppSettingsStorage()) {
      removeBrowserStorageItem('local', key)
      return
    }
    writeBrowserStorageItem('local', key, value)
  },
  removeItem: (key) => removeBrowserStorageItem('local', key),
}

function isElectronAppSettingsStorage(): boolean {
  const api = readElectronApi()
  return Boolean(api?.getAppSettings || api?.setAppSettings)
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
  if (applyingExternalSettings) return
  void saveElectronAppSettings(settings)
}

function applyLanguageFromSettings(settings: AppSettings): void {
  if (settings.language && settings.language !== i18n.language) {
    void i18n.changeLanguage(settings.language)
  }
}

function installAppSettingsUpdateListener(): void {
  if (appSettingsUpdateListenerInstalled || typeof window === 'undefined') return
  appSettingsUpdateListenerInstalled = true
  readElectronApi()?.onAppSettingsUpdated?.((settings) => {
    applyingExternalSettings = true
    try {
      const next = normalizeSettings(settings)
      useAppSettingsStore.setState({
        settings: next,
        savedAt: new Date().toISOString(),
      })
      applyLanguageFromSettings(next)
    } finally {
      applyingExternalSettings = false
    }
  })
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

async function hydrateElectronAppSettings(): Promise<void> {
  const api = readElectronApi()
  if (api?.getAppSettings) {
    const desktopSettings = await withTimeout(api.getAppSettings(), 2_000)
    if (desktopSettings) {
      const settings = normalizeSettings(desktopSettings)
      useAppSettingsStore.setState({
        settings,
        savedAt: new Date().toISOString(),
      })
      applyLanguageFromSettings(settings)
    }
  }
  if (api?.getAppSettingsSecrets) {
    const secrets = await withTimeout(api.getAppSettingsSecrets(), 2_000)
    const current = useAppSettingsStore.getState().settings
    const next = mergeAppSettingsSecrets(current, secrets)
    useAppSettingsStore.setState({ settings: next })
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs)
    promise.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

function scheduleAppSettingsHydration(callback: () => void): void {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(callback)
    return
  }
  void Promise.resolve().then(callback)
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
        const cloudAPIBaseURL = current.cloudAPIBaseURL ?? getDefaultAPIBaseURL()
        const localAPIBaseURL = current.localAPIBaseURL ?? getLocalAPIBaseURL()
        const next = normalizeSettings({
          ...current,
          launchMode,
          cloudAPIBaseURL,
          localAPIBaseURL,
          apiBaseURL: launchMode === 'local' ? localAPIBaseURL : cloudAPIBaseURL,
        })
        set({ settings: next, savedAt: new Date().toISOString() })
        syncElectronSettings(next)
      },
      setWorkMode: (workMode) => {
        const next = normalizeSettings({ ...useAppSettingsStore.getState().settings, workMode })
        set({ settings: next, savedAt: new Date().toISOString() })
        syncElectronSettings(next)
      },
      setLanguage: (language) => {
        if (!isSupportedLanguage(language)) return
        const next = normalizeSettings({ ...useAppSettingsStore.getState().settings, language })
        set({ settings: next, savedAt: new Date().toISOString() })
        void i18n.changeLanguage(language)
        syncElectronSettings(next)
      },
      setAPIBaseURL: (apiBaseURL) => {
        const current = useAppSettingsStore.getState().settings
        const normalizedAPIBaseURL = normalizeAPIBaseURL(apiBaseURL)
        const next = normalizeSettings({
          ...current,
          apiBaseURL: normalizedAPIBaseURL,
          ...(current.launchMode === 'local'
            ? { localAPIBaseURL: normalizedAPIBaseURL }
            : { cloudAPIBaseURL: normalizedAPIBaseURL }),
        })
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
      storage: createJSONStorage(() => appSettingsBrowserStorage),
      partialize: (state) => ({ settings: sanitizeAppSettingsForPersistence(state.settings), savedAt: state.savedAt }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<AppSettingsStore> | undefined
        const settings = normalizeSettings(persisted?.settings)
        return {
          ...currentState,
          ...persisted,
          settings,
          hydrated: false,
        }
      },
      onRehydrateStorage: () => (state) => {
        installAppSettingsUpdateListener()
        if (!state) {
          scheduleAppSettingsHydration(() => useAppSettingsStore.setState({ hydrated: true }))
          return
        }
        state.settings = normalizeSettings(state.settings)
        state.hydrated = false
        scheduleAppSettingsHydration(() => {
          void hydrateElectronAppSettings()
            .then(() => syncElectronSettings(useAppSettingsStore.getState().settings))
            .catch(() => null)
            .finally(() => useAppSettingsStore.setState({ hydrated: true }))
        })
      },
    }
  )
)
