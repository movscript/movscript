import {
  normalizeProviderSettings,
  type ProviderConfig,
  type ProviderSettings,
} from '@/shared/infrastructure/providerConfigStore'
import { providerSessionClient, type MovScriptWorkspaceConfig, type MovScriptWorkspaceConfigSaveInput } from '@/shared/infrastructure/providerSessionClient'

export type AgentProviderSelectionConfig = NonNullable<MovScriptWorkspaceConfig['agentSelection']>

export function agentProviderActivationSettings(settings: ProviderSettings, provider: ProviderConfig): ProviderSettings {
  if (!provider.enabled) return normalizeProviderSettings(settings)
  return normalizeProviderSettings({
    ...settings,
    defaultProviderId: provider.id,
    newConversationProviderId: provider.id,
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
  return providerSessionClient.getWorkspaceConfig()
}

export function saveAgentProviderWorkspaceConfig(input: MovScriptWorkspaceConfigSaveInput): Promise<MovScriptWorkspaceConfig> {
  return providerSessionClient.saveWorkspaceConfig(input)
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
  const settings = agentProviderActivationSettings(input.settings, input.provider)
  input.setSettings(settings)
  if (input.userId) input.setActiveConversation(input.userId, null)
  await input.saveWorkspaceConfig?.({ agentSelection: agentProviderSelectionConfigFromSettings(settings) })
}
