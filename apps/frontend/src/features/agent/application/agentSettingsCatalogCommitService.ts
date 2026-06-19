import { createAgentProviderSessionCompatibilityClient } from '@/features/agent/infrastructure/agentProviderSessionCompatibility'
import type { ProviderProfileConfigOption } from '@/features/agent/application/agentSettingsProviderModel'
import type {
  ProviderConfigFileCommitClient,
  SettingsSnapshotWriteCommitClient,
} from '@/features/agent/application/agentSettingsConfigFileTypes'

export type AgentSettingsCatalogCommitClient =
  & ProviderConfigFileCommitClient
  & SettingsSnapshotWriteCommitClient

export function createAgentSettingsCatalogCommitClient(
  input: Pick<ProviderProfileConfigOption, 'providerProfileKey'>,
): AgentSettingsCatalogCommitClient {
  return createAgentProviderSessionCompatibilityClient('settings-catalog-compat', {
    providerProfileKey: input.providerProfileKey,
  })
}
