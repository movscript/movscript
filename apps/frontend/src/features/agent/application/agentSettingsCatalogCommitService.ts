import { ProviderSessionClient } from '@/shared/infrastructure/providerSessionClient'
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
  return new ProviderSessionClient(undefined, {
    providerProfileKey: input.providerProfileKey,
  })
}
