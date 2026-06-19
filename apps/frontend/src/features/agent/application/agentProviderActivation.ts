import {
  normalizeProviderSettings,
  type ProviderConfig,
  type ProviderSettings,
} from '@/shared/infrastructure/providerConfigStore'
import type { AgentProfile } from '@/features/agent/application/agentProfileModel'
import {
  agentProviderSessionCompatibilityClient,
  type MovScriptWorkspaceConfig,
  type MovScriptWorkspaceConfigSaveInput,
} from '@/features/agent/infrastructure/agentProviderSessionCompatibility'

export type AgentProviderSelectionConfig = NonNullable<MovScriptWorkspaceConfig['agentSelection']>

export function agentProviderActivationSettings(settings: ProviderSettings, provider: ProviderConfig): ProviderSettings {
  if (!provider.enabled) return normalizeProviderSettings(settings)
  return agentProfileActivationSettings(settings, provider)
}

export function agentProfileActivationSettings(settings: ProviderSettings, profile: Pick<AgentProfile, 'id' | 'enabled'>): ProviderSettings {
  if (!profile.enabled) return normalizeProviderSettings(settings)
  return normalizeProviderSettings({
    ...settings,
    defaultProviderId: profile.id,
    newConversationProviderId: profile.id,
  })
}

export function agentProviderSelectionConfigFromSettings(settings: ProviderSettings): AgentProviderSelectionConfig {
  const normalized = normalizeProviderSettings(settings)
  return {
    defaultProviderId: normalized.defaultProviderId,
    ...(normalized.newConversationProviderId ? { newConversationProviderId: normalized.newConversationProviderId } : {}),
  }
}

export function agentProviderSettingsWithWorkspaceSelection(settings: ProviderSettings, selection: MovScriptWorkspaceConfig['agentSelection'] | undefined): ProviderSettings {
  if (!selection?.defaultProviderId && !selection?.newConversationProviderId) return normalizeProviderSettings(settings)
  return normalizeProviderSettings({
    ...settings,
    ...(selection.defaultProviderId ? { defaultProviderId: selection.defaultProviderId } : {}),
    ...(selection.newConversationProviderId ? { newConversationProviderId: selection.newConversationProviderId } : {}),
  })
}

export function loadAgentProviderWorkspaceConfig(): Promise<MovScriptWorkspaceConfig> {
  return agentProviderSessionCompatibilityClient('provider-activation-settings-compat').getWorkspaceConfig()
}

export function saveAgentProviderWorkspaceConfig(input: MovScriptWorkspaceConfigSaveInput): Promise<MovScriptWorkspaceConfig> {
  return agentProviderSessionCompatibilityClient('provider-activation-settings-compat').saveWorkspaceConfig(input)
}

export async function commitAgentProviderActivation(input: {
  settings: ProviderSettings
  provider: ProviderConfig
  userId?: string
  setSettings: (settings: ProviderSettings) => void
  setActiveConversation: (userId: string, conversationId: string | null) => void
  saveWorkspaceConfig?: (input: MovScriptWorkspaceConfigSaveInput) => Promise<unknown>
}): Promise<void> {
  if (!input.provider.enabled) return
  await commitAgentProfileActivation({
    ...input,
    profile: input.provider,
  })
}

export async function commitAgentProfileActivation(input: {
  settings: ProviderSettings
  profile: Pick<AgentProfile, 'id' | 'enabled'>
  userId?: string
  setSettings: (settings: ProviderSettings) => void
  setActiveConversation: (userId: string, conversationId: string | null) => void
  saveWorkspaceConfig?: (input: MovScriptWorkspaceConfigSaveInput) => Promise<unknown>
}): Promise<void> {
  if (!input.profile.enabled) return
  const settings = agentProfileActivationSettings(input.settings, input.profile)
  input.setSettings(settings)
  if (input.userId) input.setActiveConversation(input.userId, null)
  await input.saveWorkspaceConfig?.({ agentSelection: agentProviderSelectionConfigFromSettings(settings) })
}
