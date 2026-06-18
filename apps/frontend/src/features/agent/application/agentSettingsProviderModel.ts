import {
  hasSensitiveTextSecret,
  type AgentSettingsSnapshot,
  type ProviderModelAPIKind,
} from '@movscript/core/agent'
import { publicModelId, publicModelLabel } from '@/shared/domain/modelDisplay'
import { getAPIBaseURL } from '@/shared/infrastructure/config'
import {
  MOVA_PROVIDER_ID,
  normalizeProviderSettings,
  providerProtocol,
  type ProviderConfig,
  type ProviderSettings,
} from '@/shared/infrastructure/providerConfigStore'
import {
  ProviderSessionClient,
  type ProviderModelConfigPublic,
} from '@/shared/infrastructure/providerSessionClient'
import type { PublicModel } from '@/types'

export type ProviderProfileConfigOption = {
  id: string
  providerProfileKey: string
  label: string
  labelKey?: string
  descriptionKey?: string
  supportsWorkspaceCatalogInspection: boolean
}

const BUILT_IN_PROVIDER_PROFILE_CONFIG_FALLBACKS: Record<string, ProviderProfileConfigOption> = {
  mova: { id: 'mova', providerProfileKey: 'mova', label: 'Mova', labelKey: 'agents.settings.providerProfileConfigs.mova', descriptionKey: 'agents.settings.providerProfileConfigDescriptions.mova', supportsWorkspaceCatalogInspection: true },
  codex: { id: 'codex', providerProfileKey: 'codex', label: 'Codex', labelKey: 'agents.settings.providerProfileConfigs.codex', descriptionKey: 'agents.settings.providerProfileConfigDescriptions.codex', supportsWorkspaceCatalogInspection: false },
}

export function buildProviderProfileConfigOptions(settings: ProviderSettings): ProviderProfileConfigOption[] {
  const profiles = new Map<string, ProviderProfileConfigOption>()
  for (const provider of normalizeProviderSettings(settings).providers) {
    if (providerProtocol(provider) !== 'app-server' || !provider.appServerProfile) continue
    const profileId = normalizeProviderProfileConfigId(provider.appServerProfile.providerKey ?? provider.kind)
    const fallback = BUILT_IN_PROVIDER_PROFILE_CONFIG_FALLBACKS[profileId]
    const label = provider.label?.trim() || provider.appServerProfile.label?.trim() || fallback?.label || profileId
    profiles.set(profileId, {
      id: profileId,
      providerProfileKey: profileId,
      label,
      ...(fallback?.labelKey && label === fallback.label ? { labelKey: fallback.labelKey } : {}),
      ...(fallback?.descriptionKey ? { descriptionKey: fallback.descriptionKey } : {}),
      supportsWorkspaceCatalogInspection: supportsProviderSessionWorkspaceCatalog(provider, fallback),
    })
  }
  const options = Array.from(profiles.values())
  return options.length > 0 ? options : [BUILT_IN_PROVIDER_PROFILE_CONFIG_FALLBACKS.mova]
}

export function normalizeProviderProfileConfigId(value: unknown): string {
  if (typeof value !== 'string') return MOVA_PROVIDER_ID
  const key = value.trim().toLowerCase()
  return /^[a-z][a-z0-9_-]{0,63}$/.test(key) ? key : MOVA_PROVIDER_ID
}

export function providerModelValue(models: PublicModel[], config: ProviderModelConfigPublic): string {
  const byPublicID = models.find((model) => publicModelId(model) === config.model)
  if (byPublicID) return publicModelId(byPublicID)
  return config.model
}

export function modelDisplayName(models: PublicModel[], config: ProviderModelConfigPublic) {
  const value = providerModelValue(models, config)
  const model = models.find((item) => publicModelId(item) === value)
  return model ? publicModelLabel(model, true) : config.model
}

export function selectedProviderModel(models: PublicModel[], selectedModelId: string): PublicModel | null {
  return models.find((model) => publicModelId(model) === selectedModelId) ?? null
}

export function providerModelBaseURLState(baseURL: string) {
  const baseURLValue = baseURL.trim()
  const usesBackendCompatibleBaseURL = isBackendCompatibleBaseURL(baseURLValue)
  const usesModelCatalog = !baseURLValue || usesBackendCompatibleBaseURL
  return {
    baseURLValue,
    usesBackendCompatibleBaseURL,
    usesModelCatalog,
    usesManualModelId: !usesModelCatalog,
  }
}

export function providerConfigModelHasSecret(config: ProviderModelConfigPublic | null): boolean {
  return Boolean(config?.configured && hasSensitiveTextSecret(config.model))
}

export function providerModelSettingsHasUnsavedChanges(input: {
  effectiveConfig: ProviderModelConfigPublic | null
  providerModelConfigValue: string
  effectiveModelValue: string
  useForChat: boolean
  useForPlanner: boolean
  canSaveModelConfig: boolean
}): boolean {
  return input.effectiveConfig?.configured
    ? !providerConfigUsesModelCatalog(input.effectiveConfig) ||
      input.providerModelConfigValue !== input.effectiveModelValue ||
      input.useForChat !== input.effectiveConfig.useForChat ||
      input.useForPlanner !== input.effectiveConfig.useForPlanner
    : input.canSaveModelConfig
}

export type ProviderModelWorkspaceDraft = {
  selectedModelId: string
  useForChat: boolean
  useForPlanner: boolean
}
export type ProviderModelConfigRequest = Parameters<ProviderSessionClient['saveProviderModelConfig']>[0]
export type ProviderModelOperationPlan = {
  request: ProviderModelConfigRequest
  storedModelId: string | null
}

export function providerModelWorkspaceDraftFromConfig(input: {
  config: ProviderModelConfigPublic
  models: PublicModel[]
  noModelValue: string
}): ProviderModelWorkspaceDraft {
  const catalogModel = input.models.find((model) => publicModelId(model) === input.config.model)
  return {
    selectedModelId: catalogModel ? publicModelId(catalogModel) : input.noModelValue,
    useForChat: input.config.useForChat,
    useForPlanner: input.config.useForPlanner,
  }
}

export function clearedProviderModelWorkspaceDraft(input: { noModelValue: string }): ProviderModelWorkspaceDraft {
  return {
    selectedModelId: input.noModelValue,
    useForChat: true,
    useForPlanner: true,
  }
}

export function storedProviderModelWorkspaceId(models: PublicModel[], storedModelId: string | null | undefined): string | null {
  if (!storedModelId) return null
  const storedModel = models.find((model) => publicModelId(model) === storedModelId)
  return storedModel ? publicModelId(storedModel) : null
}

export function buildProviderModelConfigRequest(input: {
  selectedModel: PublicModel | null
  usesModelCatalog: boolean
  model: string
  apiKind: ProviderModelAPIKind
  baseURL: string
  apiKey: string
  useForChat: boolean
  useForPlanner: boolean
}): ProviderModelConfigRequest {
  return {
    model: input.model,
    apiKind: input.apiKind,
    ...(input.baseURL ? { baseURL: input.baseURL } : {}),
    ...(input.apiKey.trim() ? { apiKey: input.apiKey.trim() } : {}),
    useForChat: input.useForChat,
    useForPlanner: input.useForPlanner,
  }
}

export function buildProviderModelOperationPlan(input: Parameters<typeof buildProviderModelConfigRequest>[0]): ProviderModelOperationPlan {
  return {
    request: buildProviderModelConfigRequest(input),
    storedModelId: input.usesModelCatalog && input.selectedModel ? publicModelId(input.selectedModel) : null,
  }
}

export function buildProviderModelTestRequest(input: {
  request: ProviderModelConfigRequest
  message: string
  fallbackMessage: string
}): ProviderModelConfigRequest & { message: string } {
  return {
    message: input.message.trim() || input.fallbackMessage,
    ...input.request,
  }
}

export function providerConfigUsesModelCatalog(config: ProviderModelConfigPublic): boolean {
  const baseURL = config.baseURL?.trim() ?? ''
  return !baseURL || isBackendCompatibleBaseURL(baseURL)
}

export function buildProviderModelConfigFromSnapshotModel(
  model: NonNullable<AgentSettingsSnapshot['model']>,
): Parameters<ProviderSessionClient['saveModelConfig']>[0] {
  return {
    model: model.model,
    apiKind: 'openai_responses',
    useForChat: model.useForChat !== false,
    useForPlanner: model.useForPlanner !== false,
  }
}

export function apiKindBaseURLPlaceholder(apiKind: ProviderModelAPIKind): string {
  if (apiKind === 'openai_chat_completions') return `${getAPIBaseURL()}/v1`
  if (apiKind === 'openai_responses') return `${getAPIBaseURL()}/v1`
  if (apiKind === 'anthropic_messages') return `${getAPIBaseURL()}/v1`
  return `${getAPIBaseURL()}/v1`
}

export function isBackendCompatibleBaseURL(value: string): boolean {
  if (!value.trim()) return true
  try {
    return new URL(toCompatibleGatewayBaseURL(value)).origin === new URL(toCompatibleGatewayBaseURL(getAPIBaseURL())).origin
  } catch {
    return false
  }
}

export function toCompatibleGatewayBaseURL(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '')
  if (normalized.endsWith('/api/v1')) return `${normalized.slice(0, -'/api/v1'.length)}/v1`
  if (normalized.endsWith('/v1')) return normalized
  return `${normalized}/v1`
}

function supportsProviderSessionWorkspaceCatalog(
  provider: ProviderConfig,
  fallback?: ProviderProfileConfigOption,
): boolean {
  if (providerProtocol(provider) !== 'app-server') return false
  return fallback?.supportsWorkspaceCatalogInspection ?? true
}
