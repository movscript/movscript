import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/shared/infrastructure/api'
import { publicModelLabel } from '@/shared/domain/modelDisplay'
import type { PublicModel } from '@/types'
import { GenerationModelSelector } from '@movscript/ui'

interface ModelSelectorProps {
  capability: 'image' | 'video' | 'text'
  feature?: string
  value: number | null
  onChange: (id: number) => void
  onModelChange?: (model: PublicModel | null) => void
  disabled?: boolean
  className?: string
}

export function ModelSelector({ capability, feature, value, onChange, onModelChange, disabled, className }: ModelSelectorProps) {
  const { t } = useTranslation()
  const queryKey = feature ? ['models', capability, feature] : ['models', capability]
  const queryUrl = feature
    ? `/models?capability=${capability}&feature=${feature}`
    : `/models?capability=${capability}`

  const { data: modelsData, isFetching, refetch } = useQuery<PublicModel[]>({
    queryKey,
    queryFn: () => api.get(queryUrl).then((r) => r.data),
    staleTime: 0,
  })
  const models = modelsData ?? []

  const effectiveValue = value ?? (models.find(m => m.is_default)?.id ?? models[0]?.id ?? null)

  useEffect(() => {
    if (models.length > 0 && value === null) {
      const defaultModel = models.find(m => m.is_default) ?? models[0]
      onChange(defaultModel.id)
      onModelChange?.(defaultModel)
    }
  }, [models, value, onChange])

  function handleChange(v: string) {
    const id = Number(v)
    onChange(id)
    onModelChange?.(models.find(m => m.id === id) ?? null)
  }

  return (
    <GenerationModelSelector
      className={className}
      disabled={disabled}
      value={effectiveValue?.toString() ?? ''}
      options={models.map((model) => ({ value: model.id.toString(), label: publicModelLabel(model) }))}
      placeholder={t('shared.modelSelector.noModels')}
      refreshLabel={t('shared.modelSelector.refresh')}
      refreshing={isFetching}
      onValueChange={handleChange}
      onRefresh={() => refetch()}
    />
  )
}
