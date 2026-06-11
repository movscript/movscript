import {
  backendAgentProviderRef,
  normalizeAgentProviderKey,
  resolveDefaultAgentProviderFromBackend,
  selectDefaultAgentProviderModel,
  type DefaultAgentProviderSyncResult,
} from '@movscript/core/agent'
import { fetchAgentBackendModels } from '@/features/agent/domain/agentModelCatalog'
import { getAPIBaseURL } from '@/shared/infrastructure/config'
import { ProviderSessionClient, type MovScriptWorkspaceConfig } from '@/shared/infrastructure/providerSessionClient'
import { resolveAppServerProfile, type ProviderConfig } from '@/shared/infrastructure/providerConfigStore'
import type { PublicModel } from '@/types'

type WorkspaceConfigClient = Pick<ProviderSessionClient, 'getWorkspaceConfig' | 'saveWorkspaceConfig'>

export { backendAgentProviderRef, selectDefaultAgentProviderModel }

export async function ensureDefaultAgentProviderFromBackend(input: {
  provider: ProviderConfig
  models?: PublicModel[]
  client?: WorkspaceConfigClient
}): Promise<DefaultAgentProviderSyncResult> {
  const profile = resolveAppServerProfile(input.provider)
  const providerKey = normalizeAgentProviderKey(profile.providerKey ?? input.provider.kind)
  const client = input.client ?? new ProviderSessionClient(undefined, { providerProfileKey: providerKey })
  const config = await client.getWorkspaceConfig()
  const models = input.models ?? await fetchAgentBackendModels()
  const decision = resolveDefaultAgentProviderFromBackend({
    providerKind: input.provider.kind,
    providerKey,
    currentProvider: providerConfigRecord(config, providerKey),
    models,
    apiBaseURL: getAPIBaseURL(),
  })
  if (!decision.providerConfig) return decision.result

  const providers = isRecordOfRecords(config.providers) ? { ...config.providers } : {}
  providers[decision.result.providerKey] = decision.providerConfig
  await client.saveWorkspaceConfig({ providers })
  return decision.result
}

function providerConfigRecord(config: MovScriptWorkspaceConfig, providerKey: string): Record<string, unknown> | undefined {
  return isRecordOfRecords(config.providers) ? config.providers[providerKey] : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function isRecordOfRecords(value: unknown): value is Record<string, Record<string, unknown>> {
  if (!isRecord(value)) return false
  return Object.values(value).every(isRecord)
}
