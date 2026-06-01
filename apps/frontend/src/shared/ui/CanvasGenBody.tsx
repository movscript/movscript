import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CanvasGenerationBody } from '@movscript/ui'
import { api } from '@/shared/infrastructure/api'
import { publicModelLabel } from '@/shared/domain/modelDisplay'
import { GenerationOutputPreview } from '@/shared/ui/GenerationOutputPreview'
import type { PublicModel, RawResource } from '@/types'

export interface CanvasGenBodyProps {
  prompt?: string
  onUpdatePrompt?: (prompt: string) => void
  modelDbId?: number
  onUpdateModelId?: (id: number) => void
  capability: 'image' | 'video' | 'text'
  outputType: 'image' | 'video' | 'text'
  status: 'idle' | 'pending' | 'running' | 'done' | 'failed'
  resource?: RawResource
  error?: string
  onRun?: () => void
  textContent?: string
}

export function CanvasGenBody({
  prompt,
  onUpdatePrompt,
  modelDbId,
  onUpdateModelId,
  capability,
  outputType,
  status,
  resource,
  error,
  onRun,
  textContent,
}: CanvasGenBodyProps) {
  const { t } = useTranslation()
  const isRunning = status === 'pending' || status === 'running'

  const { data: models = [] } = useQuery<PublicModel[]>({
    queryKey: ['models', capability],
    queryFn: () => api.get(`/models?capability=${capability}`).then(r => r.data),
  })

  return (
    <CanvasGenerationBody
      models={models.map((model) => ({ value: model.id, label: publicModelLabel(model) }))}
      selectedModel={modelDbId ?? models[0]?.id ?? ''}
      onModelChange={(value) => onUpdateModelId?.(Number(value))}
      onModelClick={(event) => event.stopPropagation()}
      prompt={prompt ?? ''}
      promptPlaceholder={t('shared.generation.promptPlaceholder')}
      onPromptChange={(value) => onUpdatePrompt?.(value)}
      onPromptClick={(event) => event.stopPropagation()}
      error={error}
      output={status === 'done' && resource && outputType !== 'text' ? (
        <GenerationOutputPreview resource={resource} outputType={outputType} />
      ) : undefined}
      textOutput={status === 'done' && outputType === 'text' && textContent ? textContent : undefined}
      isRunning={isRunning}
      runningLabel={t('pages.jobs.generating')}
      runLabel={t('shared.generation.runNode')}
      onRun={(event) => { event.stopPropagation(); onRun?.() }}
    />
  )
}
