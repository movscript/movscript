import {
  hasSensitiveTextSecret,
  type ProviderModelCapabilityRoutePublic,
} from '@movscript/core/agent'
import { publicModelId, publicModelLabel } from '@/shared/domain/modelDisplay'
import { getAPIBaseURL } from '@/shared/infrastructure/config'
import {
  MOVA_PROVIDER_ID,
  normalizeProviderSettings,
  type ProviderSettings,
} from '@/shared/infrastructure/providerConfigStore'
import type { ProviderModelConfigPublic } from '@movscript/core/agent/protocol'
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
  mova: { id: 'mova', providerProfileKey: 'mova', label: 'Mova', labelKey: 'agents.settings.providerProfileConfigs.mova', descriptionKey: 'agents.settings.providerProfileConfigDescriptions.mova', supportsWorkspaceCatalogInspection: false },
  codex: { id: 'codex', providerProfileKey: 'codex', label: 'Codex', labelKey: 'agents.settings.providerProfileConfigs.codex', descriptionKey: 'agents.settings.providerProfileConfigDescriptions.codex', supportsWorkspaceCatalogInspection: false },
  claude: { id: 'claude', providerProfileKey: 'claude', label: 'Claude Code', labelKey: 'agents.settings.providerProfileConfigs.claude', descriptionKey: 'agents.settings.providerProfileConfigDescriptions.claude', supportsWorkspaceCatalogInspection: false },
}

export function buildProviderProfileConfigOptions(settings: ProviderSettings): ProviderProfileConfigOption[] {
  const profiles = new Map<string, ProviderProfileConfigOption>()
  for (const provider of normalizeProviderSettings(settings).providers) {
    const profileId = normalizeProviderProfileConfigId(provider.id || provider.kind)
    const fallback = BUILT_IN_PROVIDER_PROFILE_CONFIG_FALLBACKS[profileId]
    const label = provider.label?.trim() || fallback?.label || profileId
    profiles.set(profileId, {
      id: profileId,
      providerProfileKey: profileId,
      label,
      ...(fallback?.labelKey && label === fallback.label ? { labelKey: fallback.labelKey } : {}),
      ...(fallback?.descriptionKey ? { descriptionKey: fallback.descriptionKey } : {}),
      supportsWorkspaceCatalogInspection: fallback?.supportsWorkspaceCatalogInspection ?? false,
    })
  }
  const options = Array.from(profiles.values())
  return options.length > 0 ? options : [
    BUILT_IN_PROVIDER_PROFILE_CONFIG_FALLBACKS.codex,
    BUILT_IN_PROVIDER_PROFILE_CONFIG_FALLBACKS.mova,
    BUILT_IN_PROVIDER_PROFILE_CONFIG_FALLBACKS.claude,
  ]
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

export function providerModelEndpointBaseURLState(modelEndpointBaseURL: string) {
  const modelEndpointBaseURLValue = modelEndpointBaseURL.trim()
  const usesBackendCompatibleModelEndpoint = isBackendCompatibleModelEndpointBaseURL(modelEndpointBaseURLValue)
  const usesModelCatalog = !modelEndpointBaseURLValue || usesBackendCompatibleModelEndpoint
  return {
    modelEndpointBaseURLValue,
    usesBackendCompatibleModelEndpoint,
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

export function providerModelConfigFromSelection(input: {
  modelId: string
  useForChat?: boolean
  useForPlanner?: boolean
  updatedAt?: string
}): ProviderModelConfigPublic {
  const modelId = input.modelId.trim()
  const useForChat = input.useForChat !== false
  const useForPlanner = input.useForPlanner !== false
  return {
    configured: Boolean(modelId),
    provider: 'backend-model-config',
    model: modelId,
    apiKind: 'openai_responses',
    apiKeyConfigured: false,
    useForChat,
    useForPlanner,
    ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
    source: modelId ? 'file' : 'none',
    credentialStatus: {
      required: false,
      configured: false,
      sourceEnv: [],
      acceptedEnv: [],
    },
    capabilities: buildProviderModelSelectionRoutes({ modelId, useForChat, useForPlanner }),
  }
}

function buildProviderModelSelectionRoutes(input: {
  modelId: string
  useForChat: boolean
  useForPlanner: boolean
}): ProviderModelCapabilityRoutePublic[] {
  return [
    providerModelSelectionRoute({
      capability: 'text',
      enabled: input.useForChat,
      modelId: input.modelId,
    }),
    providerModelSelectionRoute({
      capability: 'planning',
      enabled: input.useForPlanner,
      modelId: input.modelId,
    }),
  ]
}

function providerModelSelectionRoute(input: {
  capability: ProviderModelCapabilityRoutePublic['capability']
  enabled: boolean
  modelId: string
}): ProviderModelCapabilityRoutePublic {
  return {
    capability: input.capability,
    configured: input.enabled && Boolean(input.modelId),
    ...(input.enabled && input.modelId ? {
      provider: 'backend-model-config' as const,
      model: input.modelId,
    } : {}),
    source: input.enabled && input.modelId ? 'configured' : 'disabled',
  }
}

export function providerConfigUsesModelCatalog(config: ProviderModelConfigPublic): boolean {
  const modelEndpointBaseURL = config.modelEndpointBaseURL?.trim() ?? ''
  return !modelEndpointBaseURL || isBackendCompatibleModelEndpointBaseURL(modelEndpointBaseURL)
}

export function isBackendCompatibleModelEndpointBaseURL(value: string): boolean {
  if (!value.trim()) return true
  try {
    return new URL(toCompatibleModelGatewayBaseURL(value)).origin === new URL(toCompatibleModelGatewayBaseURL(getAPIBaseURL())).origin
  } catch {
    return false
  }
}

export function toCompatibleModelGatewayBaseURL(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '')
  if (normalized.endsWith('/api/v1')) return `${normalized.slice(0, -'/api/v1'.length)}/v1`
  if (normalized.endsWith('/v1')) return normalized
  return `${normalized}/v1`
}
