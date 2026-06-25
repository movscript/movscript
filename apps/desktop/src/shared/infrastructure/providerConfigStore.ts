import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@/shared/infrastructure/browserStorage'
import { createDesktopStateStorage } from '@/shared/infrastructure/desktopStateStorage'
import {
  DEFAULT_PROVIDER_SETTINGS,
  PROVIDER_CONFIG_STORAGE_KEY,
} from '@/shared/infrastructure/providerConfigDefaults'
import {
  normalizeProviderSettingsWithRuntimeEnv,
  persistedProviderConfigStore,
  type ProviderSettings,
} from '@/shared/infrastructure/providerConfigModel'

export {
  CLAUDE_PROVIDER_ID,
  CLAUDE_RUNTIME_API_ENV,
  CLAUDE_RUNTIME_BINARY_PACKAGE_ENV,
  CLAUDE_RUNTIME_PACKAGE_ENV,
  CLAUDE_RUNTIME_PACKAGE_VERSION_ENV,
  DEFAULT_CLAUDE_RUNTIME_PACKAGE_VERSION,
  CODEX_PROVIDER_ID,
  CODEX_RUNTIME_EXECUTABLE_ENV,
  CODEX_RUNTIME_PACKAGE_ENV,
  CODEX_RUNTIME_PACKAGE_VERSION_ENV,
  CODEX_RUNTIME_API_ENV,
  CODEX_RUNTIME_SDK_PACKAGE_ENV,
  DEFAULT_PROVIDER_SETTINGS,
  MOVA_PROVIDER_ID,
  MOVA_RUNTIME_API_ENV,
  MOVA_RUNTIME_BINARY_PACKAGE_ENV,
  MOVA_RUNTIME_EXECUTABLE_ENV,
  MOVA_RUNTIME_PACKAGE_ENV,
  MOVA_RUNTIME_PACKAGE_VERSION_ENV,
  PROVIDER_CONFIG_STORAGE_KEY,
} from '@/shared/infrastructure/providerConfigDefaults'

export type {
  BuiltInProviderKind,
  BuiltInProviderMessageAdapterKind,
  BuiltInProviderProtocol,
  BuiltInProviderRuntimeApi,
  MovScriptWorkspaceContext,
  MovScriptWorkspaceScope,
  PersistedProviderConfig,
  PersistedProviderSettings,
  ProviderConfig,
  ProviderKind,
  ProviderMessageAdapterKind,
  ProviderProtocol,
  ProviderRuntimeApi,
  ProviderRuntimeProfile,
  ProviderSettings,
  ProviderThreadRef,
} from '@/shared/infrastructure/providerConfigModel'

export {
  createProviderThreadRef,
  enabledProviders,
  normalizeProviderSettings,
  normalizeProviderSettingsWithRuntimeEnv,
  persistedProviderConfigStore,
  providerInstanceId,
  providerMessageAdapter,
  providerRuntimeApi,
  providerRuntimeApiOptions,
  providerRuntimeProfile,
  providerSettingsWithRuntimeEnv,
  providerThreadRefKey,
  providerWithRuntimeApi,
  providerWithRuntimeEnv,
  providerProtocol,
  resolveDefaultProvider,
  resolveNewConversationProvider,
  resolveProviderByKind,
  usesRuntimeApi,
} from '@/shared/infrastructure/providerConfigModel'

interface ProviderConfigStore {
  settings: ProviderSettings
  savedAt: string | null
  setSettings: (settings: ProviderSettings) => void
  setDefaultProviderId: (providerId: string) => void
  setNewConversationProviderId: (providerId: string) => void
  reset: () => void
}

const memoryProviderConfigStorage: StateStorage = (() => {
  const values = new Map<string, string>()
  return {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => {
      values.set(name, value)
    },
    removeItem: (name) => {
      values.delete(name)
    },
  }
})()

function getProviderConfigStorage(): StateStorage {
  const fallback: StateStorage = typeof window === 'undefined' ? memoryProviderConfigStorage : {
    getItem: (name) => readBrowserStorageItem('local', name),
    setItem: (name, value) => writeBrowserStorageItem('local', name, value),
    removeItem: (name) => removeBrowserStorageItem('local', name),
  }
  return createDesktopStateStorage(PROVIDER_CONFIG_STORAGE_KEY, fallback)
}

export const useProviderConfigStore = create<ProviderConfigStore>()(
  persist(
    (set) => ({
      settings: DEFAULT_PROVIDER_SETTINGS,
      savedAt: null,
      setSettings: (settings) => set({
        settings: normalizeProviderSettingsWithRuntimeEnv(settings),
        savedAt: new Date().toISOString(),
      }),
      setDefaultProviderId: (providerId) => set((state) => ({
        settings: normalizeProviderSettingsWithRuntimeEnv({
          ...state.settings,
          defaultProviderId: providerId,
        }),
        savedAt: new Date().toISOString(),
      })),
      setNewConversationProviderId: (providerId) => set((state) => ({
        settings: normalizeProviderSettingsWithRuntimeEnv({
          ...state.settings,
          newConversationProviderId: providerId,
        }),
        savedAt: new Date().toISOString(),
      })),
      reset: () => set({
        settings: normalizeProviderSettingsWithRuntimeEnv(DEFAULT_PROVIDER_SETTINGS),
        savedAt: new Date().toISOString(),
      }),
    }),
    {
      name: PROVIDER_CONFIG_STORAGE_KEY,
      storage: createJSONStorage(getProviderConfigStorage),
      merge: (persisted, current) => {
        const persistedStore = persistedProviderConfigStore(persisted)
        return {
          ...current,
          savedAt: persistedStore.savedAt ?? current.savedAt,
          settings: normalizeProviderSettingsWithRuntimeEnv(persistedStore.settings),
        }
      },
    },
  ),
)

useProviderConfigStore.setState((state) => ({
  settings: normalizeProviderSettingsWithRuntimeEnv(state.settings),
}))

export function refreshProviderSettingsRuntimeEnv(): void {
  useProviderConfigStore.setState((state) => ({
    settings: normalizeProviderSettingsWithRuntimeEnv(state.settings),
  }))
}
