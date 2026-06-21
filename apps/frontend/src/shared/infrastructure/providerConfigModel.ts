import { getRuntimeConfigSnapshot } from '@/shared/infrastructure/config'
import {
  CLAUDE_PROVIDER_ID,
  CODEX_PROVIDER_ID,
  DEFAULT_PROVIDER_SETTINGS,
  MOVA_PROVIDER_ID,
} from '@/shared/infrastructure/providerConfigDefaults'
import {
  normalizeProviderRuntimeProfile,
  providerInstanceId,
  providerWithRuntimeEnv,
} from '@/shared/infrastructure/providerConfigRuntimeModel'

export {
  providerInstanceId,
  providerRuntimeApi,
  providerRuntimeApiOptions,
  providerRuntimeProfile,
  providerWithRuntimeApi,
  providerWithRuntimeEnv,
  usesRuntimeApi,
} from '@/shared/infrastructure/providerConfigRuntimeModel'

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

export type PersistedProviderConfig = Partial<Omit<ProviderConfig, 'protocol' | 'messageAdapter' | 'runtime'>> & {
  id?: string
  kind?: ProviderKind
  protocol?: ProviderProtocol
  messageAdapter?: ProviderMessageAdapterKind
  runtime?: Partial<ProviderRuntimeProfile>
}

export type PersistedProviderSettings = Partial<Omit<ProviderSettings, 'providers'>> & {
  providers?: PersistedProviderConfig[]
}

export interface ProviderThreadRef {
  providerId: string
  providerKind: ProviderKind
  providerInstanceId: string
  threadId: string
  workspaceDir?: string
}

const builtInProviderIds = new Set<string>([
  CODEX_PROVIDER_ID,
  MOVA_PROVIDER_ID,
  CLAUDE_PROVIDER_ID,
])

export function persistedProviderConfigStore(value: unknown): { settings?: PersistedProviderSettings; savedAt: string | null } {
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
        && (!provider.runtime.binaryPackageName
          || provider.runtime.binaryPackageName === '@openai/codex'
          || provider.runtime.binaryPackageName === '@movscript/mova')) {
        return {
          ...provider,
          runtime: {
            ...provider.runtime,
            binaryPackageName: '@movscript/mova-app-server',
          },
        }
      }
      if ((provider.id === MOVA_PROVIDER_ID || kind === MOVA_PROVIDER_ID)
        && provider.runtime.api === 'mova-app-server'
        && (!provider.runtime.binaryPackageName || provider.runtime.binaryPackageName === '@movscript/mova')) {
        return {
          ...provider,
          runtime: {
            ...provider.runtime,
            binaryPackageName: '@movscript/mova-app-server',
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


function providerIdFromEnv(value: string | undefined, settings: ProviderSettings): string | undefined {
  const normalized = normalizeProviderKey(value)
  if (!normalized) return undefined
  const provider = settings.providers.find((item) => item.id === normalized || item.kind === normalized)
  return provider?.enabled === false ? undefined : provider?.id
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
