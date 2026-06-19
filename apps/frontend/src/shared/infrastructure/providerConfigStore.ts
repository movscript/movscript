import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { getRuntimeConfigSnapshot } from '@/shared/infrastructure/config'
import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from '@/shared/infrastructure/browserStorage'
import { createDesktopStateStorage } from '@/shared/infrastructure/desktopStateStorage'
import {
  CLAUDE_PROVIDER_ID,
  CLAUDE_RUNTIME_API_ENV,
  CLAUDE_RUNTIME_BINARY_PACKAGE_ENV,
  CLAUDE_RUNTIME_PACKAGE_ENV,
  CLAUDE_RUNTIME_PACKAGE_VERSION_ENV,
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

export type BuiltInProviderKind = 'codex' | 'mova' | 'claude'
export type ProviderKind = BuiltInProviderKind | (string & {})
export type BuiltInProviderProtocol = 'sdk' | 'claude-code'
export type ProviderProtocol = BuiltInProviderProtocol | (string & {})
export type BuiltInProviderMessageAdapterKind = 'thread-turn-item' | 'claude-thread-message'
export type ProviderMessageAdapterKind = BuiltInProviderMessageAdapterKind | (string & {})
export type BuiltInProviderRuntimeApi = 'codex-app-server' | 'mova-app-server' | 'codex-sdk' | 'mova-sdk' | 'claude-sdk'
export type ProviderRuntimeApi = BuiltInProviderRuntimeApi | (string & {})

export type MovScriptWorkspaceScope = 'global' | 'project' | 'production'

export interface MovScriptWorkspaceContext {
  scope?: MovScriptWorkspaceScope
  projectId?: string | number
  productionId?: string | number
}

export interface ProviderConfig {
  id: string
  kind: ProviderKind
  protocol?: ProviderProtocol
  messageAdapter?: ProviderMessageAdapterKind
  label: string
  enabled: boolean
  runtime?: ProviderRuntimeProfile
}

export interface ProviderRuntimeProfile {
  id: string
  api: ProviderRuntimeApi
  label: string
  apiSource?: 'env' | 'user'
  packageName?: string
  sdkPackageName?: string
  binaryPackageName?: string
  packageVersion?: string
  executableCommand?: string
  executableEnvVar?: string
  apiEnvVar?: string
  packageNameEnvVar?: string
  sdkPackageNameEnvVar?: string
  binaryPackageNameEnvVar?: string
  packageVersionEnvVar?: string
  protocolVersion?: string
}

export interface ProviderSettings {
  providers: ProviderConfig[]
  defaultProviderId: string
  newConversationProviderId?: string
}

type PersistedProviderConfig = Partial<Omit<ProviderConfig, 'protocol' | 'messageAdapter' | 'runtime'>> & {
  id?: string
  kind?: ProviderKind
  protocol?: ProviderProtocol
  messageAdapter?: ProviderMessageAdapterKind
  runtime?: Partial<ProviderRuntimeProfile>
}

type PersistedProviderSettings = Partial<Omit<ProviderSettings, 'providers'>> & {
  providers?: PersistedProviderConfig[]
}

interface ProviderConfigStore {
  settings: ProviderSettings
  savedAt: string | null
  setSettings: (settings: ProviderSettings) => void
  setDefaultProviderId: (providerId: string) => void
  setNewConversationProviderId: (providerId: string) => void
  reset: () => void
}

export {
  CLAUDE_PROVIDER_ID,
  CLAUDE_RUNTIME_API_ENV,
  CLAUDE_RUNTIME_BINARY_PACKAGE_ENV,
  CLAUDE_RUNTIME_PACKAGE_ENV,
  CLAUDE_RUNTIME_PACKAGE_VERSION_ENV,
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
}

const builtInProviderIds = new Set<string>([
  CODEX_PROVIDER_ID,
  MOVA_PROVIDER_ID,
  CLAUDE_PROVIDER_ID,
])

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

export interface ProviderThreadRef {
  providerId: string
  providerKind: ProviderKind
  providerInstanceId: string
  threadId: string
  workspaceDir?: string
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

function persistedProviderConfigStore(value: unknown): { settings?: PersistedProviderSettings; savedAt: string | null } {
  if (!value || typeof value !== 'object') return { settings: undefined, savedAt: null }
  const store = value as { settings?: PersistedProviderSettings; savedAt?: unknown }
  return {
    settings: store.settings,
    savedAt: typeof store.savedAt === 'string' ? store.savedAt : null,
  }
}

export function normalizeProviderSettings(settings: PersistedProviderSettings | null | undefined): ProviderSettings {
  settings = migrateLegacyDefaultProviderSettings(settings)
  const inputProviders = Array.isArray(settings?.providers) ? settings.providers : []
  const providersById = new Map<string, ProviderConfig>()
  for (const provider of DEFAULT_PROVIDER_SETTINGS.providers) {
    providersById.set(provider.id, provider)
  }
  for (const provider of inputProviders) {
    if (!provider?.id?.trim()) continue
    const id = provider.id.trim()
    const fallback = providersById.get(id)
    const kind = normalizeProviderKind(provider.kind) ?? fallback?.kind
    if (!kind) continue
    const protocol = normalizeProviderProtocol(provider.protocol, fallback?.protocol, kind)
    const messageAdapter = normalizeProviderMessageAdapter(provider.messageAdapter, fallback?.messageAdapter, kind, protocol)
    const runtime = normalizeProviderRuntimeProfile(provider.runtime, fallback?.runtime, kind, protocol)
    providersById.set(id, {
      id,
      kind,
      protocol,
      messageAdapter,
      label: builtInProviderIds.has(id) ? fallback?.label || providerLabel(kind) : provider.label?.trim() || fallback?.label || providerLabel(kind),
      enabled: builtInProviderIds.has(id) ? true : provider.enabled !== false,
      runtime,
    })
  }
  const providers = Array.from(providersById.values())
  const enabledProviderIds = new Set(providers.filter((provider) => provider.enabled).map((provider) => provider.id))
  const fallbackDefault = enabledProviderIds.has(DEFAULT_PROVIDER_SETTINGS.defaultProviderId)
    ? DEFAULT_PROVIDER_SETTINGS.defaultProviderId
    : providers.find((provider) => provider.enabled)?.id ?? DEFAULT_PROVIDER_SETTINGS.defaultProviderId
  const defaultProviderId = settings?.defaultProviderId && enabledProviderIds.has(settings.defaultProviderId)
    ? settings.defaultProviderId
    : fallbackDefault
  const newConversationProviderId = settings?.newConversationProviderId && enabledProviderIds.has(settings.newConversationProviderId)
    ? settings.newConversationProviderId
    : undefined
  return {
    providers,
    defaultProviderId,
    ...(newConversationProviderId ? { newConversationProviderId } : {}),
  }
}

function migrateLegacyDefaultProviderSettings(settings: PersistedProviderSettings | null | undefined): PersistedProviderSettings | null | undefined {
  if (!settings?.providers?.length) return settings
  return {
    ...settings,
    providers: settings.providers.map((provider) => {
      const kind = provider.kind ?? provider.id
      const apiSource = provider.runtime?.apiSource
      if ((apiSource === 'user' || apiSource === 'env') || !provider.runtime?.api) return provider
      if ((provider.id === CODEX_PROVIDER_ID || kind === CODEX_PROVIDER_ID) && provider.runtime.api === 'codex-sdk') {
        return {
          ...provider,
          runtime: {
            ...provider.runtime,
            id: 'codex-codex-app-server',
            api: 'codex-app-server',
            label: 'Codex app-server',
          },
        }
      }
      if ((provider.id === MOVA_PROVIDER_ID || kind === MOVA_PROVIDER_ID) && provider.runtime.api === 'mova-sdk') {
        return {
          ...provider,
          runtime: {
            ...provider.runtime,
            id: 'mova-mova-app-server',
            api: 'mova-app-server',
            label: 'Mova app-server',
          },
        }
      }
      if ((provider.id === CODEX_PROVIDER_ID || kind === CODEX_PROVIDER_ID)
        && provider.runtime.api === 'codex-app-server'
        && (!provider.runtime.binaryPackageName || provider.runtime.binaryPackageName === '@openai/codex')) {
        return {
          ...provider,
          runtime: {
            ...provider.runtime,
            binaryPackageName: '@movscript/mova',
          },
        }
      }
      return provider
    }),
  }
}

export function normalizeProviderSettingsWithRuntimeEnv(settings: PersistedProviderSettings | null | undefined): ProviderSettings {
  const normalized = normalizeProviderSettings(settings)
  const env = getRuntimeConfigSnapshot()?.providerRuntimeEnv
  return env ? providerSettingsWithRuntimeEnv(normalized, env) : normalized
}

export function enabledProviders(settings: ProviderSettings): ProviderConfig[] {
  return normalizeProviderSettings(settings).providers.filter((provider) => provider.enabled)
}

export function resolveDefaultProvider(settings: ProviderSettings): ProviderConfig {
  const normalized = normalizeProviderSettings(settings)
  return normalized.providers.find((provider) => provider.id === normalized.defaultProviderId)
    ?? normalized.providers.find((provider) => provider.enabled)
    ?? defaultProviderFallback()
}

export function resolveNewConversationProvider(settings: ProviderSettings): ProviderConfig {
  const normalized = normalizeProviderSettings(settings)
  return normalized.providers.find((provider) => provider.id === normalized.newConversationProviderId)
    ?? resolveDefaultProvider(normalized)
}

export function resolveProviderByKind(
  settings: ProviderSettings,
  kind: ProviderKind,
): ProviderConfig | undefined {
  return normalizeProviderSettings(settings).providers.find((provider) => provider.kind === kind && provider.enabled)
}

export function providerProtocol(provider: ProviderConfig): ProviderProtocol {
  return normalizeProviderProtocol(provider.protocol, undefined, provider.kind)
}

export function providerMessageAdapter(provider: ProviderConfig): ProviderMessageAdapterKind {
  return normalizeProviderMessageAdapter(provider.messageAdapter, undefined, provider.kind, providerProtocol(provider))
}

export function providerRuntimeProfile(provider: ProviderConfig): ProviderRuntimeProfile {
  return normalizeProviderRuntimeProfile(provider.runtime, undefined, provider.kind, providerProtocol(provider))
}

export function providerRuntimeApi(provider: ProviderConfig): ProviderRuntimeApi {
  return providerRuntimeProfile(provider).api
}

export function providerRuntimeApiOptions(provider: ProviderConfig): Array<{ api: ProviderRuntimeApi; label: string }> {
  if (provider.kind === CODEX_PROVIDER_ID) return [
    { api: 'codex-app-server', label: providerRuntimeLabel(provider.kind, 'codex-app-server') },
    { api: 'codex-sdk', label: providerRuntimeLabel(provider.kind, 'codex-sdk') },
  ]
  if (provider.kind === MOVA_PROVIDER_ID) return [
    { api: 'mova-app-server', label: providerRuntimeLabel(provider.kind, 'mova-app-server') },
    { api: 'mova-sdk', label: providerRuntimeLabel(provider.kind, 'mova-sdk') },
  ]
  if (provider.kind === CLAUDE_PROVIDER_ID) return [{ api: 'claude-sdk', label: providerRuntimeLabel(provider.kind, 'claude-sdk') }]
  return [{ api: providerRuntimeApi(provider), label: providerRuntimeProfile(provider).label }]
}

export function providerWithRuntimeApi(provider: ProviderConfig, api: ProviderRuntimeApi): ProviderConfig {
  if (!isSupportedProviderRuntimeApi(api, provider.kind, providerProtocol(provider))) return provider
  const runtime = providerRuntimeProfile(provider)
  return {
    ...provider,
    runtime: {
      ...runtime,
      id: providerRuntimeId(provider.kind, api),
      api,
      apiSource: 'user',
      label: providerRuntimeLabel(provider.kind, api),
    },
  }
}

export function usesRuntimeApi(provider: ProviderConfig | undefined, api: ProviderRuntimeApi): boolean {
  return Boolean(provider && providerRuntimeApi(provider) === api)
}

export function providerSettingsWithRuntimeEnv(
  settings: ProviderSettings,
  env: Record<string, string | undefined>,
): ProviderSettings {
  const defaultProviderId = providerIdFromEnv(env.MOVSCRIPT_DEFAULT_PROVIDER, settings)
  const newConversationProviderId = providerIdFromEnv(env.MOVSCRIPT_NEW_CONVERSATION_PROVIDER, settings)
  return normalizeProviderSettings({
    ...settings,
    ...(defaultProviderId ? { defaultProviderId } : {}),
    ...(newConversationProviderId ? { newConversationProviderId } : {}),
    providers: settings.providers.map((provider) => providerWithRuntimeEnv(provider, env)),
  })
}

export function providerWithRuntimeEnv(
  provider: ProviderConfig,
  env: Record<string, string | undefined>,
): ProviderConfig {
  const runtime = providerRuntimeProfile(provider)
  const envApi = runtime.apiSource === 'user' ? undefined : runtimeApiFromEnv(provider, runtime, env)
  const nextApi = envApi ?? runtime.api
  const nextRuntime = {
    ...runtime,
    ...(nextApi !== runtime.api
      ? {
          id: providerRuntimeId(provider.kind, nextApi),
          api: nextApi,
          apiSource: 'env' as const,
          label: providerRuntimeLabel(provider.kind, nextApi),
        }
      : {}),
    ...runtimePackageFieldsFromEnv(provider, runtime, env),
  }
  if (providerRuntimeProfilesEqual(runtime, nextRuntime)) return provider
  return {
    ...provider,
    runtime: nextRuntime,
  }
}

function normalizeProviderProtocol(
  protocol: ProviderProtocol | undefined,
  fallback: ProviderProtocol | undefined,
  kind: ProviderKind,
): ProviderProtocol {
  const normalized = normalizeProviderKey(protocol)
  if (normalized && isSupportedProviderProtocol(normalized, kind)) return normalized
  const fallbackProtocol = normalizeProviderKey(fallback)
  if (fallbackProtocol && isSupportedProviderProtocol(fallbackProtocol, kind)) return fallbackProtocol
  return defaultProviderProtocol(kind)
}

function normalizeProviderMessageAdapter(
  adapter: ProviderMessageAdapterKind | undefined,
  fallback: ProviderMessageAdapterKind | undefined,
  kind: ProviderKind,
  protocol: ProviderProtocol = defaultProviderProtocol(kind),
): ProviderMessageAdapterKind {
  const normalized = normalizeProviderKey(adapter)
  if (normalized && isSupportedProviderMessageAdapter(normalized, protocol)) return normalized
  const fallbackAdapter = normalizeProviderKey(fallback)
  if (fallbackAdapter && isSupportedProviderMessageAdapter(fallbackAdapter, protocol)) return fallbackAdapter
  return defaultProviderMessageAdapter(kind)
}

function isSupportedProviderMessageAdapter(adapter: string, protocol: ProviderProtocol): boolean {
  if (protocol === 'claude-code') return adapter === 'claude-thread-message'
  return adapter === 'thread-turn-item'
}

function isSupportedProviderProtocol(protocol: string, kind: ProviderKind): boolean {
  if (kind === 'claude') return protocol === 'claude-code'
  return protocol === 'sdk'
}

function defaultProviderProtocol(kind: ProviderKind): ProviderProtocol {
  if (kind === 'claude') return 'claude-code'
  return 'sdk'
}

function defaultProviderMessageAdapter(kind: ProviderKind): ProviderMessageAdapterKind {
  if (kind === 'claude') return 'claude-thread-message'
  return 'thread-turn-item'
}

function normalizeProviderRuntimeProfile(
  runtime: Partial<ProviderRuntimeProfile> | undefined,
  fallback: ProviderRuntimeProfile | undefined,
  kind: ProviderKind,
  protocol: ProviderProtocol,
): ProviderRuntimeProfile {
  const api = normalizeProviderRuntimeApi(runtime?.api, fallback?.api, kind, protocol)
  const id = normalizeProviderKey(runtime?.id) ?? normalizeProviderKey(fallback?.id) ?? providerRuntimeId(kind, api)
  return {
    id,
    api,
    label: runtime?.label?.trim() || fallback?.label || providerRuntimeLabel(kind, api),
    ...normalizedRuntimeApiSource(runtime?.apiSource ?? fallback?.apiSource),
    ...normalizedRuntimeStringField('packageName', runtime?.packageName ?? fallback?.packageName),
    ...normalizedRuntimeStringField('sdkPackageName', runtime?.sdkPackageName ?? fallback?.sdkPackageName),
    ...normalizedRuntimeStringField('binaryPackageName', runtime?.binaryPackageName ?? fallback?.binaryPackageName),
    ...normalizedRuntimeStringField('packageVersion', runtime?.packageVersion ?? fallback?.packageVersion),
    ...normalizedRuntimeStringField('executableCommand', runtime?.executableCommand ?? fallback?.executableCommand),
    ...normalizedRuntimeEnvField('executableEnvVar', runtime?.executableEnvVar ?? fallback?.executableEnvVar ?? defaultProviderRuntimeExecutableEnvVar(kind)),
    ...normalizedRuntimeEnvField('apiEnvVar', runtime?.apiEnvVar ?? fallback?.apiEnvVar ?? defaultProviderRuntimeApiEnvVar(kind)),
    ...normalizedRuntimeEnvField('packageNameEnvVar', runtime?.packageNameEnvVar ?? fallback?.packageNameEnvVar ?? defaultProviderRuntimePackageEnvVar(kind)),
    ...normalizedRuntimeEnvField('sdkPackageNameEnvVar', runtime?.sdkPackageNameEnvVar ?? fallback?.sdkPackageNameEnvVar ?? defaultProviderRuntimeSdkPackageEnvVar(kind)),
    ...normalizedRuntimeEnvField('binaryPackageNameEnvVar', runtime?.binaryPackageNameEnvVar ?? fallback?.binaryPackageNameEnvVar ?? defaultProviderRuntimeBinaryPackageEnvVar(kind)),
    ...normalizedRuntimeEnvField('packageVersionEnvVar', runtime?.packageVersionEnvVar ?? fallback?.packageVersionEnvVar ?? defaultProviderRuntimePackageVersionEnvVar(kind)),
    ...normalizedRuntimeStringField('protocolVersion', runtime?.protocolVersion ?? fallback?.protocolVersion),
  }
}

function normalizedRuntimeApiSource(value: unknown): Pick<ProviderRuntimeProfile, 'apiSource'> {
  return value === 'env' || value === 'user' ? { apiSource: value } : {}
}

function normalizeProviderRuntimeApi(
  api: ProviderRuntimeApi | undefined,
  fallback: ProviderRuntimeApi | undefined,
  kind: ProviderKind,
  protocol: ProviderProtocol,
): ProviderRuntimeApi {
  const normalized = normalizeProviderKey(api)
  if (normalized && isSupportedProviderRuntimeApi(normalized, kind, protocol)) return normalized
  const fallbackApi = normalizeProviderKey(fallback)
  if (fallbackApi && isSupportedProviderRuntimeApi(fallbackApi, kind, protocol)) return fallbackApi
  return defaultProviderRuntimeApi(kind, protocol)
}

function isSupportedProviderRuntimeApi(api: string, kind: ProviderKind, protocol: ProviderProtocol): boolean {
  if (kind === 'codex') return api === 'codex-app-server' || api === 'codex-sdk'
  if (kind === 'mova') return api === 'mova-app-server' || api === 'mova-sdk'
  if (kind === 'claude') return api === 'claude-sdk'
  return Boolean(protocol && api)
}

function defaultProviderRuntimeApi(kind: ProviderKind, protocol: ProviderProtocol): ProviderRuntimeApi {
  if (kind === 'codex') return 'codex-app-server'
  if (kind === 'mova') return 'mova-app-server'
  if (kind === 'claude') return 'claude-sdk'
  return protocol
}

function providerRuntimeId(kind: ProviderKind, api: ProviderRuntimeApi): string {
  return `${kind}-${api}`
}

function providerRuntimeLabel(kind: ProviderKind, api: ProviderRuntimeApi): string {
  if (api === 'codex-app-server') return 'Codex app-server'
  if (api === 'mova-app-server') return 'Mova app-server'
  if (api === 'codex-sdk') return 'Codex SDK'
  if (api === 'mova-sdk') return 'Mova SDK'
  if (api === 'claude-sdk') return 'Claude Agent SDK'
  return `${providerLabel(kind)} ${api}`
}

function runtimeApiFromEnv(
  provider: ProviderConfig,
  runtime: ProviderRuntimeProfile,
  env: Record<string, string | undefined>,
): ProviderRuntimeApi | undefined {
  const names = [
    runtime.apiEnvVar,
    defaultProviderRuntimeApiEnvVar(provider.kind),
    `MOVSCRIPT_${provider.kind.toUpperCase().replace(/-/g, '_')}_RUNTIME_API`,
  ].filter(Boolean) as string[]
  for (const name of names) {
    const value = normalizeProviderKey(env[name])
    if (value && isSupportedProviderRuntimeApi(value, provider.kind, providerProtocol(provider))) return value
  }
  return undefined
}

function providerIdFromEnv(value: string | undefined, settings: ProviderSettings): string | undefined {
  const normalized = normalizeProviderKey(value)
  if (!normalized) return undefined
  const provider = settings.providers.find((item) => item.id === normalized || item.kind === normalized)
  return provider?.enabled === false ? undefined : provider?.id
}

function defaultProviderRuntimeApiEnvVar(kind: ProviderKind): string | undefined {
  if (kind === CODEX_PROVIDER_ID) return CODEX_RUNTIME_API_ENV
  if (kind === MOVA_PROVIDER_ID) return MOVA_RUNTIME_API_ENV
  if (kind === CLAUDE_PROVIDER_ID) return CLAUDE_RUNTIME_API_ENV
  return undefined
}

function defaultProviderRuntimePackageEnvVar(kind: ProviderKind): string | undefined {
  if (kind === CODEX_PROVIDER_ID) return CODEX_RUNTIME_PACKAGE_ENV
  if (kind === MOVA_PROVIDER_ID) return MOVA_RUNTIME_PACKAGE_ENV
  if (kind === CLAUDE_PROVIDER_ID) return CLAUDE_RUNTIME_PACKAGE_ENV
  return undefined
}

function defaultProviderRuntimeSdkPackageEnvVar(kind: ProviderKind): string | undefined {
  if (kind === CODEX_PROVIDER_ID) return CODEX_RUNTIME_SDK_PACKAGE_ENV
  return undefined
}

function defaultProviderRuntimeBinaryPackageEnvVar(kind: ProviderKind): string | undefined {
  if (kind === CODEX_PROVIDER_ID) return undefined
  if (kind === MOVA_PROVIDER_ID) return MOVA_RUNTIME_BINARY_PACKAGE_ENV
  if (kind === CLAUDE_PROVIDER_ID) return CLAUDE_RUNTIME_BINARY_PACKAGE_ENV
  return undefined
}

function defaultProviderRuntimeExecutableEnvVar(kind: ProviderKind): string | undefined {
  if (kind === CODEX_PROVIDER_ID) return CODEX_RUNTIME_EXECUTABLE_ENV
  if (kind === MOVA_PROVIDER_ID) return MOVA_RUNTIME_EXECUTABLE_ENV
  return undefined
}

function defaultProviderRuntimePackageVersionEnvVar(kind: ProviderKind): string | undefined {
  if (kind === CODEX_PROVIDER_ID) return CODEX_RUNTIME_PACKAGE_VERSION_ENV
  if (kind === MOVA_PROVIDER_ID) return MOVA_RUNTIME_PACKAGE_VERSION_ENV
  if (kind === CLAUDE_PROVIDER_ID) return CLAUDE_RUNTIME_PACKAGE_VERSION_ENV
  return undefined
}

function runtimePackageFieldsFromEnv(
  provider: ProviderConfig,
  runtime: ProviderRuntimeProfile,
  env: Record<string, string | undefined>,
): Partial<ProviderRuntimeProfile> {
  return {
    ...runtimeStringFieldFromEnv('executableCommand', runtimeExecutableEnvNames(provider, runtime), env),
    ...runtimeStringFieldFromEnv('packageName', runtimePackageEnvNames(provider, runtime, 'packageNameEnvVar', 'RUNTIME_PACKAGE'), env),
    ...runtimeStringFieldFromEnv('sdkPackageName', runtimePackageEnvNames(provider, runtime, 'sdkPackageNameEnvVar', 'RUNTIME_SDK_PACKAGE'), env),
    ...runtimeStringFieldFromEnv('binaryPackageName', runtimePackageEnvNames(provider, runtime, 'binaryPackageNameEnvVar', 'RUNTIME_BINARY_PACKAGE'), env),
    ...runtimeStringFieldFromEnv('packageVersion', runtimePackageEnvNames(provider, runtime, 'packageVersionEnvVar', 'RUNTIME_PACKAGE_VERSION'), env),
  }
}

function runtimeExecutableEnvNames(
  provider: ProviderConfig,
  runtime: ProviderRuntimeProfile,
): string[] {
  const providerEnvPrefix = provider.kind.toUpperCase().replace(/-/g, '_')
  return [
    runtime.executableEnvVar,
    defaultProviderRuntimeExecutableEnvVar(provider.kind),
    `MOVSCRIPT_${providerEnvPrefix}_RUNTIME_EXECUTABLE`,
  ].filter(Boolean) as string[]
}

function runtimePackageEnvNames(
  provider: ProviderConfig,
  runtime: ProviderRuntimeProfile,
  explicitKey: 'packageNameEnvVar' | 'sdkPackageNameEnvVar' | 'binaryPackageNameEnvVar' | 'packageVersionEnvVar',
  genericSuffix: string,
): string[] {
  const providerEnvPrefix = provider.kind.toUpperCase().replace(/-/g, '_')
  return [
    runtime[explicitKey],
    `MOVSCRIPT_${providerEnvPrefix}_${genericSuffix}`,
  ].filter(Boolean) as string[]
}

function runtimeStringFieldFromEnv<K extends 'executableCommand' | 'packageName' | 'sdkPackageName' | 'binaryPackageName' | 'packageVersion'>(
  key: K,
  names: string[],
  env: Record<string, string | undefined>,
): Partial<Pick<ProviderRuntimeProfile, K>> {
  for (const name of names) {
    const value = env[name]?.trim()
    if (value) return { [key]: value } as Partial<Pick<ProviderRuntimeProfile, K>>
  }
  return {}
}

function providerRuntimeProfilesEqual(a: ProviderRuntimeProfile, b: ProviderRuntimeProfile): boolean {
  const keys: Array<keyof ProviderRuntimeProfile> = [
    'id',
    'api',
    'apiSource',
    'label',
    'packageName',
    'sdkPackageName',
    'binaryPackageName',
    'packageVersion',
    'executableCommand',
    'executableEnvVar',
    'apiEnvVar',
    'packageNameEnvVar',
    'sdkPackageNameEnvVar',
    'binaryPackageNameEnvVar',
    'packageVersionEnvVar',
    'protocolVersion',
  ]
  return keys.every((key) => a[key] === b[key])
}

function normalizedRuntimeStringField<K extends string>(key: K, value: string | undefined): { [P in K]?: string } {
  const normalized = value?.trim()
  return normalized ? { [key]: normalized } as { [P in K]?: string } : {}
}

function normalizedRuntimeEnvField<K extends string>(key: K, value: string | undefined): { [P in K]?: string } {
  const normalized = normalizeEnvironmentVariableName(value)
  return normalized ? { [key]: normalized } as { [P in K]?: string } : {}
}

function normalizeEnvironmentVariableName(value: string | undefined): string | undefined {
  const normalized = value?.trim().toUpperCase()
  return normalized && /^[A-Z_][A-Z0-9_]*$/.test(normalized) ? normalized : undefined
}

function defaultProviderFallback(): ProviderConfig {
  const fallback = DEFAULT_PROVIDER_SETTINGS.providers.find((provider) => provider.id === DEFAULT_PROVIDER_SETTINGS.defaultProviderId)
  if (!fallback) throw new Error(`Default provider is not configured: ${DEFAULT_PROVIDER_SETTINGS.defaultProviderId}`)
  return fallback
}

function normalizeProviderKind(kind: unknown): ProviderKind | undefined {
  return normalizeProviderKey(kind) as ProviderKind | undefined
}

function normalizeProviderKey(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const key = value.trim().toLowerCase()
  return /^[a-z][a-z0-9_-]{0,63}$/.test(key) ? key : undefined
}

function providerLabel(kind: string): string {
  return kind
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || kind
}

export function providerInstanceId(provider: ProviderConfig): string {
  return providerRuntimeProfile(provider).id
}

export function createProviderThreadRef(input: {
  provider: ProviderConfig
  threadId: string
  workspaceDir?: string
}): ProviderThreadRef {
  return {
    providerId: input.provider.id,
    providerKind: input.provider.kind,
    providerInstanceId: providerInstanceId(input.provider),
    threadId: input.threadId,
    ...(input.workspaceDir?.trim() ? { workspaceDir: input.workspaceDir.trim() } : {}),
  }
}

export function providerThreadRefKey(ref: ProviderThreadRef): string {
  return [
    ref.providerKind,
    ref.providerId,
    ref.providerInstanceId,
    ref.workspaceDir ?? '',
    ref.threadId,
  ].join(':')
}
