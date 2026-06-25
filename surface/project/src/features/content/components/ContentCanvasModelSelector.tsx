import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  publicAgentBackendModelId as publicModelId,
  publicAgentBackendModelLabel as publicModelLabel,
} from '@movscript/core/agent'
import {
  listSurfaceModelsByCapability,
  modelKeys,
  surfaceModelQueryCapability,
  type PublicModel,
} from '@movscript/shared'
import { GenerationModelSelector } from '@movscript/ui/business/generation'

interface ContentCanvasModelSelectorProps {
  capability: 'image' | 'video' | 'audio' | 'text'
  value: string | null
  onChange: (id: string) => void
  onModelChange?: (model: PublicModel | null) => void
  disabled?: boolean
  className?: string
}

export function ContentCanvasModelSelector({
  capability,
  value,
  onChange,
  onModelChange,
  disabled,
  className,
}: ContentCanvasModelSelectorProps) {
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

  function handleChange(nextValue: string) {
    onChange(nextValue)
    onModelChange?.(models.find((model) => publicModelId(model) === nextValue) ?? null)
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
