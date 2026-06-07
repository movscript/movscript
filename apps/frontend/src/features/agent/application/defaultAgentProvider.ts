import { fetchAgentBackendModels } from '@/features/agent/domain/agentModelCatalog'
import { publicModelId } from '@/shared/domain/modelDisplay'
import { getAPIBaseURL } from '@/shared/infrastructure/config'
import { ProviderSessionClient, type MovScriptWorkspaceConfig } from '@/shared/infrastructure/providerSessionClient'
import { resolveAppServerProfile, type ProviderConfig } from '@/shared/infrastructure/providerConfigStore'
import type { PublicModel } from '@/types'

type WorkspaceConfigClient = Pick<ProviderSessionClient, 'getWorkspaceConfig' | 'saveWorkspaceConfig'>

export type DefaultAgentProviderSyncResult = {
  status: 'created' | 'existing' | 'unavailable'
  providerKey: string
  providerRef?: string
  model?: string
  reason?: string
}

export async function ensureDefaultAgentProviderFromBackend(input: {
  provider: ProviderConfig
  models?: PublicModel[]
  client?: WorkspaceConfigClient
}): Promise<DefaultAgentProviderSyncResult> {
  const profile = resolveAppServerProfile(input.provider)
  const providerKey = normalizeProviderKey(profile.providerKey ?? input.provider.kind)
  const client = input.client ?? new ProviderSessionClient(undefined, { providerProfileKey: providerKey })
  const config = await client.getWorkspaceConfig()
  const currentProvider = providerConfigRecord(config, providerKey)
  if (hasExplicitAgentProviderConfig(currentProvider)) {
    return { status: 'existing', providerKey, reason: 'provider config already declares an agent provider source' }
  }

  const models = input.models ?? await fetchAgentBackendModels()
  const model = selectDefaultAgentProviderModel(models)
  if (!model) return { status: 'unavailable', providerKey, reason: 'backend has no enabled text or reasoning model' }

  const providerRef = backendAgentProviderRef(model)
  const modelId = publicModelId(model)
  const providers = isRecordOfRecords(config.providers) ? { ...config.providers } : {}
  providers[providerKey] = {
    ...(currentProvider ?? {}),
    enabled: currentProvider?.enabled === false ? false : true,
    providerRef,
    authSource: 'model-provider',
    defaultModel: modelId,
    baseURL: `${getAPIBaseURL()}/v1`,
    config: {
      mode: 'backendKey',
      modelProviderRef: providerRef,
    },
    auth: {
      mode: 'backendKey',
      modelProviderRef: providerRef,
    },
    defaultAgentProvider: {
      source: 'backend-model',
      providerRef,
      model: modelId,
      credentialId: model.credential_id,
    },
  }
  await client.saveWorkspaceConfig({ providers })
  return { status: 'created', providerKey, providerRef, model: modelId }
}

export function selectDefaultAgentProviderModel(models: PublicModel[]): PublicModel | undefined {
  return models.find((model) => model.is_default) ?? models[0]
}

export function backendAgentProviderRef(model: PublicModel): string {
  return `backend:${model.credential_id}`
}

function hasExplicitAgentProviderConfig(provider: Record<string, unknown> | undefined): boolean {
  if (!provider) return false
  if (provider.enabled === false) return true
  return Boolean(
    stringField(provider.providerRef)
      || stringField(provider.authSource)
      || stringField(provider.baseURL)
      || stringField(provider.baseUrl)
      || isRecord(provider.config)
      || isRecord(provider.auth),
  )
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

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeProviderKey(value: string): string {
  const normalized = value.trim().toLowerCase()
  return /^[a-z][a-z0-9_-]{0,63}$/.test(normalized) ? normalized : 'mova'
}
