import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AgentProviderKind = 'codex' | 'movscript-agent'

export type CodexAppServerLifecycle = 'movscript-owned'

export interface CodexAppServerProfile {
  id: string
  label: string
  executablePath?: string
  codexHome: string
  workspaceDir?: string
  lifecycle: CodexAppServerLifecycle
}

export interface AgentProviderConfig {
  id: string
  kind: AgentProviderKind
  label: string
  enabled: boolean
  /**
   * Deprecated: Codex providers are managed app-server profiles. Kept only so
   * older persisted settings can be normalized without losing the provider.
   */
  endpoint?: string
  codexProfile?: CodexAppServerProfile
}

export interface AgentProviderSettings {
  providers: AgentProviderConfig[]
  defaultProviderId: string
  newConversationProviderId?: string
}

interface AgentProviderConfigStore {
  settings: AgentProviderSettings
  savedAt: string | null
  setSettings: (settings: AgentProviderSettings) => void
  setDefaultProviderId: (providerId: string) => void
  setNewConversationProviderId: (providerId: string) => void
  reset: () => void
}

export const MOVSCRIPT_AGENT_PROVIDER_ID = 'movscript-agent'
export const CODEX_SYSTEM_AGENT_PROVIDER_ID = 'codex'
export const CODEX_MOVSCRIPT_AGENT_PROVIDER_ID = 'codex-movscript-managed'
export const CODEX_AGENT_PROVIDER_ID = CODEX_SYSTEM_AGENT_PROVIDER_ID
export const AGENT_PROVIDER_CONFIG_STORAGE_KEY = 'movscript-agent-provider-config'
export const CODEX_SYSTEM_HOME_PROFILE_ID = 'codex-system-home'
export const CODEX_MOVSCRIPT_HOME_PROFILE_ID = 'codex-movscript-home'
export const MOVSCRIPT_MANAGED_CODEX_HOME = '.movscript/.codex'

export interface AgentThreadRef {
  providerId: string
  providerKind: AgentProviderKind
  providerInstanceId: string
  threadId: string
  workspaceDir?: string
}

export const DEFAULT_CODEX_SYSTEM_HOME_PROFILE: CodexAppServerProfile = {
  id: CODEX_MOVSCRIPT_HOME_PROFILE_ID,
  label: 'MovScript Codex',
  codexHome: MOVSCRIPT_MANAGED_CODEX_HOME,
  lifecycle: 'movscript-owned',
}

export const DEFAULT_CODEX_MOVSCRIPT_HOME_PROFILE: CodexAppServerProfile = {
  id: CODEX_MOVSCRIPT_HOME_PROFILE_ID,
  label: 'MovScript Codex',
  codexHome: MOVSCRIPT_MANAGED_CODEX_HOME,
  lifecycle: 'movscript-owned',
}

export const DEFAULT_AGENT_PROVIDER_SETTINGS: AgentProviderSettings = {
  defaultProviderId: MOVSCRIPT_AGENT_PROVIDER_ID,
  newConversationProviderId: undefined,
  providers: [
    {
      id: CODEX_SYSTEM_AGENT_PROVIDER_ID,
      kind: 'codex',
      label: 'MovScript Codex',
      enabled: true,
      codexProfile: DEFAULT_CODEX_MOVSCRIPT_HOME_PROFILE,
    },
    {
      id: MOVSCRIPT_AGENT_PROVIDER_ID,
      kind: 'movscript-agent',
      label: 'MovScript Agent',
      enabled: true,
    },
  ],
}

export const useAgentProviderConfigStore = create<AgentProviderConfigStore>()(
  persist(
    (set) => ({
      settings: DEFAULT_AGENT_PROVIDER_SETTINGS,
      savedAt: null,
      setSettings: (settings) => set({
        settings: normalizeAgentProviderSettings(settings),
        savedAt: new Date().toISOString(),
      }),
      setDefaultProviderId: (providerId) => set((state) => ({
        settings: normalizeAgentProviderSettings({
          ...state.settings,
          defaultProviderId: providerId,
        }),
        savedAt: new Date().toISOString(),
      })),
      setNewConversationProviderId: (providerId) => set((state) => ({
        settings: normalizeAgentProviderSettings({
          ...state.settings,
          newConversationProviderId: providerId,
        }),
        savedAt: new Date().toISOString(),
      })),
      reset: () => set({
        settings: normalizeAgentProviderSettings(DEFAULT_AGENT_PROVIDER_SETTINGS),
        savedAt: new Date().toISOString(),
      }),
    }),
    { name: AGENT_PROVIDER_CONFIG_STORAGE_KEY },
  ),
)

export function normalizeAgentProviderSettings(settings: Partial<AgentProviderSettings> | null | undefined): AgentProviderSettings {
  const inputProviders = Array.isArray(settings?.providers) ? settings.providers : []
  const providersById = new Map<string, AgentProviderConfig>()
  for (const provider of DEFAULT_AGENT_PROVIDER_SETTINGS.providers) {
    providersById.set(provider.id, provider)
  }
  for (const provider of inputProviders) {
    if (!provider?.id?.trim()) continue
    const id = provider.id.trim() === CODEX_MOVSCRIPT_AGENT_PROVIDER_ID ? CODEX_AGENT_PROVIDER_ID : provider.id.trim()
    const fallback = providersById.get(id)
    const kind = provider.kind === 'codex' || provider.kind === 'movscript-agent'
      ? provider.kind
      : fallback?.kind
    if (!kind) continue
    providersById.set(id, {
      id,
      kind,
      label: provider.label?.trim() || fallback?.label || providerLabel(kind),
      enabled: provider.enabled !== false,
      ...(kind === 'codex' ? { codexProfile: normalizeCodexAppServerProfile(provider.codexProfile, fallback?.codexProfile) } : {}),
    })
  }
  const providers = Array.from(providersById.values())
  const enabledProviderIds = new Set(providers.filter((provider) => provider.enabled).map((provider) => provider.id))
  const fallbackDefault = enabledProviderIds.has(DEFAULT_AGENT_PROVIDER_SETTINGS.defaultProviderId)
    ? DEFAULT_AGENT_PROVIDER_SETTINGS.defaultProviderId
    : providers.find((provider) => provider.enabled)?.id ?? DEFAULT_AGENT_PROVIDER_SETTINGS.defaultProviderId
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

export function enabledAgentProviders(settings: AgentProviderSettings): AgentProviderConfig[] {
  return normalizeAgentProviderSettings(settings).providers.filter((provider) => provider.enabled)
}

export function resolveDefaultAgentProvider(settings: AgentProviderSettings): AgentProviderConfig {
  const normalized = normalizeAgentProviderSettings(settings)
  return normalized.providers.find((provider) => provider.id === normalized.defaultProviderId)
    ?? normalized.providers.find((provider) => provider.enabled)
    ?? DEFAULT_AGENT_PROVIDER_SETTINGS.providers[0]
}

export function resolveNewConversationAgentProvider(settings: AgentProviderSettings): AgentProviderConfig {
  const normalized = normalizeAgentProviderSettings(settings)
  return normalized.providers.find((provider) => provider.id === normalized.newConversationProviderId)
    ?? normalized.providers.find((provider) => provider.kind === 'movscript-agent' && provider.enabled)
    ?? resolveDefaultAgentProvider(normalized)
}

export function resolveCodexAgentProvider(settings: AgentProviderSettings): AgentProviderConfig | undefined {
  return normalizeAgentProviderSettings(settings).providers.find((provider) => provider.kind === 'codex' && provider.enabled)
}

export function resolveCodexAppServerProfile(provider: AgentProviderConfig | undefined): CodexAppServerProfile {
  return normalizeCodexAppServerProfile(provider?.codexProfile, DEFAULT_CODEX_MOVSCRIPT_HOME_PROFILE)
}

export function normalizeCodexAppServerProfile(
  profile: Partial<CodexAppServerProfile> | null | undefined,
  fallback: CodexAppServerProfile = DEFAULT_CODEX_MOVSCRIPT_HOME_PROFILE,
): CodexAppServerProfile {
  const id = normalizedCodexProfileId(profile?.id?.trim() || fallback.id || CODEX_MOVSCRIPT_HOME_PROFILE_ID)
  const codexHome = managedCodexHome(profile?.codexHome?.trim() || fallback.codexHome || DEFAULT_CODEX_MOVSCRIPT_HOME_PROFILE.codexHome)
  return {
    id,
    label: profile?.label?.trim() || fallback.label || 'MovScript Codex',
    ...(profile?.executablePath?.trim() ? { executablePath: profile.executablePath.trim() } : fallback.executablePath ? { executablePath: fallback.executablePath } : {}),
    codexHome,
    ...(profile?.workspaceDir?.trim() ? { workspaceDir: profile.workspaceDir.trim() } : fallback.workspaceDir ? { workspaceDir: fallback.workspaceDir } : {}),
    lifecycle: 'movscript-owned',
  }
}

function normalizedCodexProfileId(id: string): string {
  return CODEX_MOVSCRIPT_HOME_PROFILE_ID
}

function managedCodexHome(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '~/.codex' || trimmed === '~' || trimmed.startsWith('~/') || trimmed.startsWith('/')) {
    return MOVSCRIPT_MANAGED_CODEX_HOME
  }
  return trimmed === MOVSCRIPT_MANAGED_CODEX_HOME
    || trimmed.startsWith(`${MOVSCRIPT_MANAGED_CODEX_HOME}/`)
    ? trimmed
    : MOVSCRIPT_MANAGED_CODEX_HOME
}

export function providerInstanceIdForAgentProvider(provider: AgentProviderConfig): string {
  if (provider.kind === 'codex') return resolveCodexAppServerProfile(provider).id
  return provider.id
}

export function createAgentThreadRef(input: {
  provider: AgentProviderConfig
  threadId: string
  workspaceDir?: string
}): AgentThreadRef {
  return {
    providerId: input.provider.id,
    providerKind: input.provider.kind,
    providerInstanceId: providerInstanceIdForAgentProvider(input.provider),
    threadId: input.threadId,
    ...(input.workspaceDir?.trim() ? { workspaceDir: input.workspaceDir.trim() } : {}),
  }
}

export function agentThreadRefKey(ref: AgentThreadRef): string {
  return [
    ref.providerKind,
    ref.providerId,
    ref.providerInstanceId,
    ref.workspaceDir ?? '',
    ref.threadId,
  ].join(':')
}

function providerLabel(kind: AgentProviderKind): string {
  return kind === 'codex' ? 'Codex' : 'MovScript Agent'
}
