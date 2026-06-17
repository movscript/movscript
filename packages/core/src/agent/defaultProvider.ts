import {
  publicAgentBackendModelId,
  type AgentBackendPublicModel,
} from './modelCatalog.js'

export type DefaultAgentProviderSyncResult = {
  status: 'created' | 'existing' | 'unavailable'
  providerKey: string
  providerRef?: string
  model?: string
  reason?: string
}

export interface DefaultAgentProviderDecision<TProviderConfig extends Record<string, unknown> = Record<string, unknown>> {
  result: DefaultAgentProviderSyncResult
  providerConfig?: TProviderConfig
}

export function resolveDefaultAgentProviderFromBackend<TModel extends AgentBackendPublicModel>(input: {
  providerKind: string
  providerKey?: string
  currentProvider?: Record<string, unknown>
  models: TModel[]
  apiBaseURL: string
}): DefaultAgentProviderDecision {
  const providerKey = normalizeAgentProviderKey(input.providerKey ?? input.providerKind)
  if (hasExplicitAgentProviderConfig(input.currentProvider)) {
    return {
      result: {
        status: 'existing',
        providerKey,
        reason: 'provider config already declares an agent provider source',
      },
    }
  }

  const model = selectDefaultAgentProviderModel(input.models)
  if (!model) {
    return {
      result: {
        status: 'unavailable',
        providerKey,
        reason: 'backend has no enabled text or reasoning model',
      },
    }
  }

  const providerRef = backendAgentProviderRef(model)
  const modelId = publicAgentBackendModelId(model)
  return {
    result: {
      status: 'created',
      providerKey,
      providerRef,
      model: modelId,
    },
    providerConfig: buildBackendDefaultAgentProviderConfig({
      currentProvider: input.currentProvider,
      model,
      modelId,
      providerRef,
      apiBaseURL: input.apiBaseURL,
    }),
  }
}

export function buildBackendDefaultAgentProviderConfig<TModel extends AgentBackendPublicModel>(input: {
  currentProvider?: Record<string, unknown>
  model: TModel
  modelId?: string
  providerRef?: string
  apiBaseURL: string
}): Record<string, unknown> {
  const providerRef = input.providerRef ?? backendAgentProviderRef(input.model)
  const modelId = input.modelId ?? publicAgentBackendModelId(input.model)
  return {
    ...(input.currentProvider ?? {}),
    enabled: input.currentProvider?.enabled === false ? false : true,
    providerRef,
    configSource: 'backend',
    defaultModel: modelId,
    baseURL: `${input.apiBaseURL.replace(/\/+$/, '')}/v1`,
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
      credentialId: input.model.credential_id,
    },
  }
}

export function selectDefaultAgentProviderModel<TModel extends AgentBackendPublicModel>(models: TModel[]): TModel | undefined {
  return models.find((model) => model.is_default) ?? models[0]
}

export function backendAgentProviderRef(model: Pick<AgentBackendPublicModel, 'credential_id'>): string {
  return `backend:${model.credential_id}`
}

export function hasExplicitAgentProviderConfig(provider: Record<string, unknown> | undefined): boolean {
  if (!provider) return false
  if (provider.enabled === false) return true
  return Boolean(
    stringField(provider.providerRef)
      || stringField(provider.configSource)
      || stringField(provider.authSource)
      || stringField(provider.baseURL)
      || stringField(provider.baseUrl)
      || isRecord(provider.config)
      || isRecord(provider.auth),
  )
}

export function normalizeAgentProviderKey(value: string): string {
  const normalized = value.trim().toLowerCase()
  return /^[a-z][a-z0-9_-]{0,63}$/.test(normalized) ? normalized : 'mova'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
