import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  appServerProviderKindForProvider,
  normalizeAppServerProfile,
  normalizeProviderKey,
  providerLabel,
  type PersistedAppServerProfile,
} from '@/shared/infrastructure/providerConfigAppServerProfile'
import {
  CODEX_PROVIDER_ID,
  CODEX_MOVSCRIPT_HOME_PROFILE_ID,
  DEFAULT_CODEX_MOVSCRIPT_HOME_PROFILE,
  DEFAULT_MOVA_MOVSCRIPT_HOME_PROFILE,
  DEFAULT_PROVIDER_SETTINGS,
  MOVA_PROVIDER_ID,
  MOVA_MOVSCRIPT_HOME_PROFILE_ID,
  MOVSCRIPT_MANAGED_CODEX_HOME,
  MOVSCRIPT_MANAGED_MOVA_HOME,
  PROVIDER_CONFIG_STORAGE_KEY,
} from '@/shared/infrastructure/providerConfigDefaults'

export type BuiltInProviderKind = 'codex' | 'mova' | 'claude'
export type ProviderKind = BuiltInProviderKind | (string & {})
export type AppServerProviderKind = 'codex' | 'mova' | (string & {})
export type BuiltInProviderProtocol = 'app-server' | 'claude-code'
export type ProviderProtocol = BuiltInProviderProtocol | (string & {})
export type BuiltInProviderMessageAdapterKind = 'thread-turn-item' | 'claude-thread-message'
export type ProviderMessageAdapterKind = BuiltInProviderMessageAdapterKind | (string & {})

export type AppServerLifecycle = 'movscript-owned'
export type MovScriptWorkspaceScope = 'global' | 'project' | 'production'

export interface MovScriptWorkspaceContext {
  scope?: MovScriptWorkspaceScope
  projectId?: string | number
  productionId?: string | number
}

export interface AppServerProfile {
  id: string
  label: string
  providerKey?: AppServerProviderKind
  executablePath?: string
  executableCommand?: string
  executableEnvVar?: string
  compatibilityBinEnvNames?: string[]
  candidateRootRelativePaths?: string[]
  candidateBinaryNames?: string[]
  pathFallbackReady?: boolean
  home: string
  compatibilityHomeEnvNames?: string[]
  workspaceDir?: string
  lifecycle: AppServerLifecycle
}

export interface ProviderConfig {
  id: string
  kind: ProviderKind
  protocol?: ProviderProtocol
  messageAdapter?: ProviderMessageAdapterKind
  label: string
  enabled: boolean
  appServerProfile?: AppServerProfile
}

export interface ProviderSettings {
  providers: ProviderConfig[]
  defaultProviderId: string
  newConversationProviderId?: string
}

type PersistedProviderConfig = Partial<Omit<ProviderConfig, 'protocol' | 'messageAdapter' | 'appServerProfile'>> & {
  id?: string
  kind?: ProviderKind
  protocol?: ProviderProtocol
  messageAdapter?: ProviderMessageAdapterKind
  appServerProfile?: PersistedAppServerProfile
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
  CODEX_PROVIDER_ID,
  CODEX_MOVSCRIPT_HOME_PROFILE_ID,
  DEFAULT_CODEX_MOVSCRIPT_HOME_PROFILE,
  DEFAULT_MOVA_MOVSCRIPT_HOME_PROFILE,
  DEFAULT_PROVIDER_SETTINGS,
  MOVA_PROVIDER_ID,
  MOVA_MOVSCRIPT_HOME_PROFILE_ID,
  MOVSCRIPT_MANAGED_CODEX_HOME,
  MOVSCRIPT_MANAGED_MOVA_HOME,
  PROVIDER_CONFIG_STORAGE_KEY,
}

export { normalizeAppServerProfile } from '@/shared/infrastructure/providerConfigAppServerProfile'

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
        settings: normalizeProviderSettings(settings),
        savedAt: new Date().toISOString(),
      }),
      setDefaultProviderId: (providerId) => set((state) => ({
        settings: normalizeProviderSettings({
          ...state.settings,
          defaultProviderId: providerId,
        }),
        savedAt: new Date().toISOString(),
      })),
      setNewConversationProviderId: (providerId) => set((state) => ({
        settings: normalizeProviderSettings({
          ...state.settings,
          newConversationProviderId: providerId,
        }),
        savedAt: new Date().toISOString(),
      })),
      reset: () => set({
        settings: normalizeProviderSettings(DEFAULT_PROVIDER_SETTINGS),
        savedAt: new Date().toISOString(),
      }),
    }),
    {
      name: PROVIDER_CONFIG_STORAGE_KEY,
      merge: (persisted, current) => {
        const persistedStore = persistedProviderConfigStore(persisted)
        return {
          ...current,
          savedAt: persistedStore.savedAt ?? current.savedAt,
          settings: normalizeProviderSettings(persistedStore.settings),
        }
      },
    },
  ),
)

function persistedProviderConfigStore(value: unknown): { settings?: PersistedProviderSettings; savedAt: string | null } {
  if (!value || typeof value !== 'object') return { settings: undefined, savedAt: null }
  const store = value as { settings?: PersistedProviderSettings; savedAt?: unknown }
  return {
    settings: store.settings,
    savedAt: typeof store.savedAt === 'string' ? store.savedAt : null,
  }
}

export function normalizeProviderSettings(settings: PersistedProviderSettings | null | undefined): ProviderSettings {
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
    providersById.set(id, {
      id,
      kind,
      protocol,
      messageAdapter,
      label: provider.label?.trim() || fallback?.label || providerLabel(kind),
      enabled: provider.enabled !== false,
      ...(protocol === 'app-server'
        ? {
            appServerProfile: normalizeAppServerProfile(
              persistedAppServerProfileForKind(provider),
              appServerProviderKindForProvider(provider, kind),
              persistedAppServerProfileForKind(fallback),
            ),
          }
        : {}),
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

export function usesAppServerProtocol(provider: ProviderConfig | undefined): boolean {
  return Boolean(provider && providerProtocol(provider) === 'app-server')
}

export function resolveAppServerProfile(provider: ProviderConfig): AppServerProfile {
  if (!usesAppServerProtocol(provider) && !provider.appServerProfile) {
    throw new Error(`Provider ${provider.id} does not expose an app-server profile.`)
  }
  const kind = appServerProviderKindForProvider(provider, provider.kind)
  return normalizeAppServerProfile(
    persistedAppServerProfileForKind(provider),
    kind,
  )
}

function normalizeProviderProtocol(
  protocol: ProviderProtocol | undefined,
  fallback: ProviderProtocol | undefined,
  kind: ProviderKind,
): ProviderProtocol {
  const normalized = normalizeProviderKey(protocol)
  if (normalized) return normalized
  const fallbackProtocol = normalizeProviderKey(fallback)
  if (fallbackProtocol) return fallbackProtocol
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
  if (protocol !== 'app-server') return true
  return adapter === 'thread-turn-item'
}

function defaultProviderProtocol(kind: ProviderKind): ProviderProtocol {
  if (kind === 'claude') return 'claude-code'
  return 'app-server'
}

function defaultProviderMessageAdapter(kind: ProviderKind): ProviderMessageAdapterKind {
  if (kind === 'claude') return 'claude-thread-message'
  return 'thread-turn-item'
}

function defaultProviderFallback(): ProviderConfig {
  const fallback = DEFAULT_PROVIDER_SETTINGS.providers.find((provider) => provider.id === DEFAULT_PROVIDER_SETTINGS.defaultProviderId)
  if (!fallback) throw new Error(`Default provider is not configured: ${DEFAULT_PROVIDER_SETTINGS.defaultProviderId}`)
  return fallback
}

function persistedAppServerProfileForKind(
  provider: ProviderConfig | PersistedProviderConfig | undefined,
): AppServerProfile | PersistedAppServerProfile | undefined {
  if (!provider) return undefined
  return provider.appServerProfile
}

function normalizeProviderKind(kind: unknown): ProviderKind | undefined {
  return normalizeProviderKey(kind) as ProviderKind | undefined
}

export function providerInstanceId(provider: ProviderConfig): string {
  if (usesAppServerProtocol(provider)) return resolveAppServerProfile(provider).id
  return provider.id
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
