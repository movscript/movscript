import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import type { PublicModel } from '@/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

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
    <div className={cn('flex items-center gap-1', className)}>
      <Select
        disabled={disabled || models.length === 0}
        value={effectiveValue?.toString() ?? ''}
        onValueChange={handleChange}
      >
        <SelectTrigger className="min-w-[140px]">
          <SelectValue placeholder={models.length === 0 ? t('shared.modelSelector.noModels') : undefined} />
        </SelectTrigger>
        <SelectContent>
          {models.map((m) => (
            <SelectItem key={m.id} value={m.id.toString()}>
              {m.provider_name ? `${m.provider_name} / ${m.display_name}` : m.display_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <button
        onClick={() => refetch()}
        disabled={isFetching}
        title={t('shared.modelSelector.refresh')}
        className="text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0"
      >
        <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} />
      </button>
    </div>
  )
}
