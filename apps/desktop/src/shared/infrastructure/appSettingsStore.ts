import { create } from 'zustand'
import { readElectronApi } from '@/shared/infrastructure/electronApiAccess'
import i18n, { isSupportedLanguage, type SupportedLanguage } from '@/i18n'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@/shared/infrastructure/browserStorage'
import {
  APP_SETTINGS_STORAGE_KEY,
  getDaemonGatewayBaseURL,
  getDefaultAPIBaseURL,
  normalizeAPIBaseURL,
  refreshRuntimeConfigSnapshot,
  type AppSettings,
} from '@/shared/infrastructure/config'
import type { ShotLibrarySourceConfig } from '@/shared/contracts/appSettings'
import type { ElectronAppSettingsSecrets } from '@/shared/contracts/electronApi'
import { normalizeAppSettings } from '@movscript/shared'

interface AppSettingsStore {
  settings: AppSettings
  savedAt: string | null
  hydrated: boolean
  completeOnboarding: (settings: Partial<AppSettings>) => void
  setOnboardingSettings: (settings: Partial<AppSettings>) => void
  setLaunchMode: (launchMode: AppSettings['launchMode']) => void
  setWorkMode: (workMode: AppSettings['workMode']) => void
  setLanguage: (language: SupportedLanguage) => void
  setDataConnectionURL: (url: string) => void
  setAPIBaseURL: (apiBaseURL: string) => void
  setMovScriptWorkspaceDir: (workspaceDir: string) => void
  setShotLibrarySources: (sources: ShotLibrarySourceConfig[], defaultSourceId?: string) => void
  reset: () => void
}

const defaultSettings: AppSettings = {
  dataConnection: { kind: 'cloud', url: getDefaultAPIBaseURL() },
  apiBaseURL: getDefaultAPIBaseURL(),
  cloudAPIBaseURL: getDefaultAPIBaseURL(),
  daemonGatewayBaseURL: getDaemonGatewayBaseURL(),
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
    daemonGatewayBaseURL: getDaemonGatewayBaseURL(),
  })
}

function dataConnectionForSettingsPatch(
  current: AppSettings,
  patch: Partial<AppSettings>,
): AppSettings['dataConnection'] | undefined {
  const kind = patch.dataConnection?.kind === 'local' || patch.launchMode === 'local' ? 'local'
    : patch.dataConnection?.kind === 'cloud' || patch.launchMode === 'cloud' ? 'cloud'
    : undefined
  if (!kind) return patch.dataConnection
  const patchAPIBaseURL = patch.apiBaseURL?.trim() ? normalizeAPIBaseURL(patch.apiBaseURL) : undefined
  if (kind === 'local') {
    return {
      kind: 'local',
      url: getDaemonGatewayBaseURL(),
    }
  }
  const cloudAPIBaseURL = patch.cloudAPIBaseURL
    ?? patchAPIBaseURL
    ?? current.cloudAPIBaseURL
    ?? getDefaultAPIBaseURL()
  return {
    kind,
    url: patch.dataConnection?.url ?? cloudAPIBaseURL,
  }
}

function settingsWithDataConnectionURL(current: AppSettings, url: string): AppSettings {
  const normalizedURL = normalizeAPIBaseURL(url)
  if (current.dataConnection.kind === 'local') {
    return normalizeSettings({
      ...current,
      dataConnection: { kind: 'local', url: getDaemonGatewayBaseURL() },
      daemonGatewayBaseURL: getDaemonGatewayBaseURL(),
      apiBaseURL: getDaemonGatewayBaseURL(),
    })
  }
  return normalizeSettings({
    ...current,
    apiBaseURL: normalizedURL,
    cloudAPIBaseURL: normalizedURL,
    dataConnection: { kind: 'cloud', url: normalizedURL },
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

type PersistedRendererAppSettings = Omit<
  AppSettings,
  'apiBaseURL' | 'cloudAPIBaseURL' | 'daemonGatewayBaseURL' | 'dataConnection'
> & {
  dataConnection: Pick<AppSettings['dataConnection'], 'kind'>
}

export function sanitizeAppSettingsForPersistence(settings: AppSettings): PersistedRendererAppSettings {
  const {
    apiBaseURL: _derivedAPIBaseURL,
    cloudAPIBaseURL: _derivedCloudAPIBaseURL,
    daemonGatewayBaseURL: _derivedDaemonGatewayBaseURL,
    dataConnection: rawDataConnection,
    ...settingsWithoutDerivedURLs
  } = settings
  const { url: _derivedDataConnectionURL, ...dataConnection } = rawDataConnection
  return {
    ...settingsWithoutDerivedURLs,
    dataConnection,
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
        const current = useAppSettingsStore.getState().settings
        const dataConnection = dataConnectionForSettingsPatch(current, partial)
        const next = normalizeSettings({
          ...current,
          ...partial,
          ...(dataConnection ? { dataConnection } : {}),
          onboardingCompleted: true,
        })
        set({ settings: next, savedAt: new Date().toISOString() })
        syncElectronSettings(next)
      },
      setOnboardingSettings: (partial) => {
        const current = useAppSettingsStore.getState().settings
        const dataConnection = dataConnectionForSettingsPatch(current, partial)
        const next = normalizeSettings({
          ...current,
          ...partial,
          ...(dataConnection ? { dataConnection } : {}),
          onboardingCompleted: partial.onboardingCompleted ?? current.onboardingCompleted,
        })
        set({ settings: next, savedAt: new Date().toISOString() })
        syncElectronSettings(next)
      },
      setLaunchMode: (launchMode) => {
        const current = useAppSettingsStore.getState().settings
        const cloudAPIBaseURL = current.cloudAPIBaseURL ?? getDefaultAPIBaseURL()
        const daemonGatewayBaseURL = getDaemonGatewayBaseURL()
        const next = normalizeSettings({
          ...current,
          launchMode,
          dataConnection: {
            kind: launchMode,
            url: launchMode === 'local' ? daemonGatewayBaseURL : cloudAPIBaseURL,
          },
          cloudAPIBaseURL,
          daemonGatewayBaseURL,
          apiBaseURL: launchMode === 'local' ? daemonGatewayBaseURL : cloudAPIBaseURL,
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
      setDataConnectionURL: (url) => {
        const current = useAppSettingsStore.getState().settings
        const next = settingsWithDataConnectionURL(current, url)
        set({ settings: next, savedAt: new Date().toISOString() })
        syncElectronSettings(next)
      },
      setAPIBaseURL: (apiBaseURL) => {
        useAppSettingsStore.getState().setDataConnectionURL(apiBaseURL)
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
