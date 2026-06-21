import type { ProviderSettings } from '@/shared/infrastructure/providerConfigStore'
import {
  agentProfilesFromProviderSettings,
  type AgentProfile,
} from '@/features/agent/application/agentProfileModel'

export function enabledAgentProfiles(settings: ProviderSettings): AgentProfile[] {
  return agentProfilesFromProviderSettings(settings).filter((profile) => profile.enabled)
}

export function hasEnabledAgentProvider(settings: ProviderSettings): boolean {
  return enabledAgentProfiles(settings).length > 0
}
