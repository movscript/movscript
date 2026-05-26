import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CanvasGenerationBody } from '@movscript/ui'
import { AuthedImage, AuthedVideo } from '@/shared/ui/AuthedImage'
import { api } from '@/shared/infrastructure/api'
import { API_BASE_URL as API_BASE } from '@/shared/infrastructure/config'
import { publicModelLabel } from '@/shared/domain/modelDisplay'
import type { PublicModel, RawResource } from '@/types'

export interface CanvasGenBodyProps {
  prompt?: string
  onUpdatePrompt?: (prompt: string) => void
  modelDbId?: number
  onUpdateModelId?: (id: number) => void
  capability: 'image' | 'video' | 'text'
  featureKey: string
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
  featureKey,
  outputType,
  status,
  resource,
  error,
  onRun,
  textContent,
}: CanvasGenBodyProps) {
  const { t } = useTranslation()
  const isRunning = status === 'pending' || status === 'running'
  const outputUrl = resource
    ? resource.direct_url ?? `${API_BASE}${resource.url}`
    : undefined

  const { data: models = [] } = useQuery<PublicModel[]>({
    queryKey: ['models', capability, featureKey],
    queryFn: () => api.get(`/models?capability=${capability}&feature=${featureKey}`).then(r => r.data),
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
      output={status === 'done' && outputUrl && outputType !== 'text' ? (
        <>
          {outputType === 'image'
            ? (resource?.direct_url
              ? <img src={outputUrl} alt="" />
              : <AuthedImage src={outputUrl} alt="" />)
            : (resource?.direct_url
              ? <video src={outputUrl} controls />
              : <AuthedVideo src={outputUrl} controls />)
          }
        </>
      ) : undefined}
      textOutput={status === 'done' && outputType === 'text' && textContent ? textContent : undefined}
      isRunning={isRunning}
      runningLabel={t('pages.jobs.generating')}
      runLabel={t('shared.generation.runNode')}
      onRun={(event) => { event.stopPropagation(); onRun?.() }}
    />
  )
}
