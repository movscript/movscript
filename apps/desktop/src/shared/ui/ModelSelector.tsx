import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { GenerationModelSelector } from '@movscript/ui/business/generation'
import {
  listSurfaceModelsByCapability,
  modelKeys,
  surfaceModelQueryCapability,
  type PublicModel,
  type SurfaceModelCapability,
} from '@movscript/shared'
import {
  publicAgentBackendModelId as publicModelId,
  publicAgentBackendModelLabel as publicModelLabel,
} from '@movscript/core/agent'

interface ModelSelectorProps {
  capability: SurfaceModelCapability
  value: string | null
  onChange: (id: string) => void
  onModelChange?: (model: PublicModel | null) => void
  disabled?: boolean
  className?: string
}

export function ModelSelector({ capability, value, onChange, onModelChange, disabled, className }: ModelSelectorProps) {
  const { t } = useTranslation()
  const queryCapability = surfaceModelQueryCapability(capability)

  const { data: modelsData, isFetching, refetch } = useQuery<PublicModel[]>({
    queryKey: modelKeys.capability(queryCapability),
    queryFn: () => listSurfaceModelsByCapability(queryCapability),
    staleTime: 0,
  })
  const models = modelsData ?? []
  const defaultModel = models.find((model) => model.is_default) ?? models[0]

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
