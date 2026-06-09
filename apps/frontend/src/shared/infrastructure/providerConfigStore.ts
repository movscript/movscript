import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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

type PersistedAppServerProfile = Partial<AppServerProfile>

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

export const CODEX_PROVIDER_ID = 'codex'
export const MOVA_PROVIDER_ID = 'mova'
export const PROVIDER_CONFIG_STORAGE_KEY = 'movscript-provider-config'
export const CODEX_MOVSCRIPT_HOME_PROFILE_ID = 'codex-movscript-home'
export const MOVA_MOVSCRIPT_HOME_PROFILE_ID = 'mova-movscript-home'
export const MOVSCRIPT_MANAGED_CODEX_HOME = '.movscript/.codex'
export const MOVSCRIPT_MANAGED_MOVA_HOME = '.movscript/.mova'

export interface ProviderThreadRef {
  providerId: string
  providerKind: ProviderKind
  providerInstanceId: string
  threadId: string
  workspaceDir?: string
}

export const DEFAULT_CODEX_MOVSCRIPT_HOME_PROFILE: AppServerProfile = {
  id: CODEX_MOVSCRIPT_HOME_PROFILE_ID,
  label: 'MovScript Codex',
  providerKey: 'codex',
  executableCommand: 'codex',
  executableEnvVar: 'MOVSCRIPT_CODEX_APP_SERVER_BIN',
  compatibilityBinEnvNames: ['MOVSCRIPT_CODEX_BIN'],
  candidateRootRelativePaths: [
    '../codex/codex-rs/target/debug',
    '../../codex/codex-rs/target/debug',
    '../../../codex/codex-rs/target/debug',
  ],
  candidateBinaryNames: [
    'app-server',
    'codex-app-server',
    'codex',
  ],
  pathFallbackReady: false,
  home: MOVSCRIPT_MANAGED_CODEX_HOME,
  lifecycle: 'movscript-owned',
}

export const DEFAULT_MOVA_MOVSCRIPT_HOME_PROFILE: AppServerProfile = {
  id: MOVA_MOVSCRIPT_HOME_PROFILE_ID,
  label: 'MovScript Mova',
  providerKey: 'mova',
  executableCommand: 'mova',
  executableEnvVar: 'MOVSCRIPT_MOVA_APP_SERVER_BIN',
  compatibilityBinEnvNames: ['MOVSCRIPT_MOVA_BIN'],
  candidateRootRelativePaths: [
    '../mova/codex-rs/target/debug',
    '../../mova/codex-rs/target/debug',
    '../../../mova/codex-rs/target/debug',
  ],
  candidateBinaryNames: [
    'app-server',
    'mova-app-server',
    ['codex', 'app-server'].join('-'),
    'codex',
  ],
  pathFallbackReady: false,
  home: MOVSCRIPT_MANAGED_MOVA_HOME,
  compatibilityHomeEnvNames: ['CODEX_HOME'],
  lifecycle: 'movscript-owned',
}

export const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {
  defaultProviderId: MOVA_PROVIDER_ID,
  newConversationProviderId: undefined,
  providers: [
    {
      id: MOVA_PROVIDER_ID,
      kind: 'mova',
      protocol: 'app-server',
      messageAdapter: 'thread-turn-item',
      label: 'MovScript Mova',
      enabled: true,
      appServerProfile: DEFAULT_MOVA_MOVSCRIPT_HOME_PROFILE,
    },
    {
      id: CODEX_PROVIDER_ID,
      kind: 'codex',
      protocol: 'app-server',
      messageAdapter: 'thread-turn-item',
      label: 'MovScript Codex',
      enabled: true,
      appServerProfile: DEFAULT_CODEX_MOVSCRIPT_HOME_PROFILE,
    },
  ],
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

export function normalizeAppServerProfile(
  profile: PersistedAppServerProfile | null | undefined,
  kind: AppServerProviderKind,
  fallback: AppServerProfile | PersistedAppServerProfile = defaultAppServerProfile(kind),
): AppServerProfile {
  const defaultProfile = defaultAppServerProfile(kind)
  const id = normalizedAppServerProfileId(profile?.id?.trim() || fallback.id || defaultProfile.id, kind)
  const home = managedAppServerHome(
    profile?.home?.trim() || fallback.home || defaultProfile.home,
    kind,
  )
  return {
    id,
    label: profile?.label?.trim() || fallback.label || defaultProfile.label,
    providerKey: kind,
    ...(profile?.executablePath?.trim() ? { executablePath: profile.executablePath.trim() } : fallback.executablePath ? { executablePath: fallback.executablePath } : {}),
    ...(profile?.executableCommand?.trim() ? { executableCommand: profile.executableCommand.trim() } : fallback.executableCommand ? { executableCommand: fallback.executableCommand } : {}),
    ...(profile?.executableEnvVar?.trim() ? { executableEnvVar: normalizeEnvironmentVariableName(profile.executableEnvVar) ?? profile.executableEnvVar.trim() } : fallback.executableEnvVar ? { executableEnvVar: fallback.executableEnvVar } : {}),
    ...normalizedStringListField('compatibilityBinEnvNames', profile?.compatibilityBinEnvNames ?? fallback.compatibilityBinEnvNames, normalizeEnvironmentVariableName),
    ...normalizedStringListField('candidateRootRelativePaths', profile?.candidateRootRelativePaths ?? fallback.candidateRootRelativePaths),
    ...normalizedStringListField('candidateBinaryNames', profile?.candidateBinaryNames ?? fallback.candidateBinaryNames),
    ...(typeof profile?.pathFallbackReady === 'boolean' ? { pathFallbackReady: profile.pathFallbackReady } : typeof fallback.pathFallbackReady === 'boolean' ? { pathFallbackReady: fallback.pathFallbackReady } : {}),
    home,
    ...normalizedCompatibilityHomeEnvNamesField(profile?.compatibilityHomeEnvNames ?? fallback.compatibilityHomeEnvNames),
    ...(profile?.workspaceDir?.trim() ? { workspaceDir: profile.workspaceDir.trim() } : fallback.workspaceDir ? { workspaceDir: fallback.workspaceDir } : {}),
    lifecycle: 'movscript-owned',
  }
}

function normalizedCompatibilityHomeEnvNamesField(value: string[] | undefined): { compatibilityHomeEnvNames?: string[] } {
  return normalizedStringListField('compatibilityHomeEnvNames', value, normalizeEnvironmentVariableName)
}

function normalizedStringListField<K extends string>(
  key: K,
  value: string[] | undefined,
  normalize: (value: string) => string | undefined = (item) => item.trim() || undefined,
): { [P in K]?: string[] } {
  const values: string[] = []
  for (const item of value ?? []) {
    const normalized = typeof item === 'string' ? normalize(item) : undefined
    if (!normalized) continue
    if (!values.includes(normalized)) values.push(normalized)
  }
  return values.length > 0 ? { [key]: values } as { [P in K]?: string[] } : {}
}

function normalizeEnvironmentVariableName(value: string): string | undefined {
  const normalized = value.trim().toUpperCase()
  return /^[A-Z_][A-Z0-9_]*$/.test(normalized) ? normalized : undefined
}

function persistedAppServerProfileForKind(
  provider: ProviderConfig | PersistedProviderConfig | undefined,
): AppServerProfile | PersistedAppServerProfile | undefined {
  if (!provider) return undefined
  return provider.appServerProfile
}

function appServerProviderKindForProvider(
  provider: ProviderConfig | PersistedProviderConfig | undefined,
  fallback: ProviderKind,
): AppServerProviderKind {
  return normalizeAppServerProviderKind(provider?.appServerProfile?.providerKey) ?? normalizeAppServerProviderKind(fallback) ?? MOVA_PROVIDER_ID
}

function normalizeProviderKind(kind: unknown): ProviderKind | undefined {
  return normalizeProviderKey(kind) as ProviderKind | undefined
}

function normalizeAppServerProviderKind(kind: unknown): AppServerProviderKind | undefined {
  return normalizeProviderKey(kind) as AppServerProviderKind | undefined
}

function normalizeProviderKey(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const key = value.trim().toLowerCase()
  return /^[a-z][a-z0-9_-]{0,63}$/.test(key) ? key : undefined
}

function defaultAppServerProfile(kind: AppServerProviderKind): AppServerProfile {
  return {
    id: `${kind}-movscript-home`,
    label: `MovScript ${providerLabel(kind)}`,
    providerKey: kind,
    home: managedAppServerHomePath(kind),
    lifecycle: 'movscript-owned',
  }
}

function normalizedAppServerProfileId(id: string, kind: AppServerProviderKind): string {
  return normalizeProviderKey(id) ?? `${kind}-movscript-home`
}

function managedAppServerHome(value: string, kind: AppServerProviderKind): string {
  const managedHome = managedAppServerHomePath(kind)
  const trimmed = value.trim()
  if (!trimmed || trimmed === '~' || trimmed.startsWith('~/') || trimmed.startsWith('/')) {
    return managedHome
  }
  return trimmed === managedHome
    || trimmed.startsWith(`${managedHome}/`)
    ? trimmed
    : managedHome
}

function managedAppServerHomePath(kind: AppServerProviderKind): string {
  return `.movscript/.${kind}`
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

function providerLabel(kind: string): string {
  return kind
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || kind
}
