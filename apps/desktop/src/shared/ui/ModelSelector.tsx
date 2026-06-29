import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { GenerationModelSelector } from '@movscript/ui/business/generation'
import {
  listSurfaceModelsByCapability,
  modelKeys,
  surfaceModelReferenceAssetsKey,
  surfaceModelQueryCapability,
  type PublicModel,
  type SurfaceModelReferenceAssetIntent,
  type SurfaceModelCapability,
} from '@movscript/shared'
import {
  publicAgentBackendModelId as publicModelId,
  publicAgentBackendModelLabel as publicModelLabel,
} from '@movscript/core/agent'

interface ModelSelectorProps {
  capability: SurfaceModelCapability
  queryCapabilities?: SurfaceModelCapability[]
  operation?: string
  referenceAssets?: SurfaceModelReferenceAssetIntent[]
  value: string | null
  onChange: (id: string) => void
  onModelChange?: (model: PublicModel | null) => void
  disabled?: boolean
  className?: string
}

export function ModelSelector({ capability, queryCapabilities, operation, referenceAssets, value, onChange, onModelChange, disabled, className }: ModelSelectorProps) {
  const { t } = useTranslation()
  const queryCapability = surfaceModelQueryCapability(capability)
  const queryCapabilityList = normalizeModelQueryCapabilities(queryCapabilities ?? [capability])
  const referenceAssetsKey = surfaceModelReferenceAssetsKey(referenceAssets)

  const { data: modelsData, isFetching, refetch } = useQuery<PublicModel[]>({
    queryKey: modelKeys.intent(queryCapabilityList.join(','), operation, referenceAssetsKey),
    queryFn: async () => {
      const groups = await Promise.all(queryCapabilityList.map((item) => listSurfaceModelsByCapability(item, { operation, referenceAssets })))
      return dedupeModels(groups.flat())
    },
    staleTime: 0,
  })
  const models = modelsData ?? []
  const defaultModel = preferredDefaultModel(models, queryCapabilityList)

  const effectiveValue = value ?? (defaultModel ? publicModelId(defaultModel) : null)

  useEffect(() => {
    if (defaultModel && value === null) {
      onChange(publicModelId(defaultModel))
      onModelChange?.(defaultModel)
    }
  }, [defaultModel, value, onChange, onModelChange])

  function handleChange(v: string) {
    onChange(v)
    onModelChange?.(models.find(m => publicModelId(m) === v) ?? null)
  }

  return (
    <GenerationModelSelector
      className={className}
      disabled={disabled}
      value={effectiveValue?.toString() ?? ''}
      options={models.map((model) => ({ value: publicModelId(model), label: publicModelLabel(model) }))}
      placeholder={t('shared.modelSelector.noModels')}
      refreshLabel={t('shared.modelSelector.refresh')}
      refreshing={isFetching}
      onValueChange={handleChange}
      onRefresh={() => refetch()}
    />
  )
}

function normalizeModelQueryCapabilities(capabilities: SurfaceModelCapability[]) {
  const seen = new Set<string>()
  const out: SurfaceModelCapability[] = []
  for (const capability of capabilities) {
    const queryCapability = surfaceModelQueryCapability(capability)
    if (seen.has(queryCapability)) continue
    seen.add(queryCapability)
    out.push(queryCapability)
  }
  return out
}

function dedupeModels(models: PublicModel[]) {
  const seen = new Set<string>()
  const out: PublicModel[] = []
  for (const model of models) {
    const id = publicModelId(model)
    if (seen.has(id)) continue
    seen.add(id)
    out.push(model)
  }
  return out
}

function preferredDefaultModel(models: PublicModel[], capabilityPriority: readonly string[]) {
  for (const capability of capabilityPriority) {
    const model = models.find((item) => item.is_default && item.capabilities?.includes(capability)) ??
      models.find((item) => item.capabilities?.includes(capability))
    if (model) return model
  }
  return models.find((model) => model.is_default) ?? models[0]
}
