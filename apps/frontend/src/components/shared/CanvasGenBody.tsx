import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Loader2, Wand2 } from 'lucide-react'
import { AuthedImage, AuthedVideo } from './AuthedImage'
import { api } from '@/lib/api'
import { API_BASE_URL as API_BASE } from '@/lib/config'
import { publicModelLabel } from '@/lib/modelDisplay'
import { cn } from '@/lib/utils'
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
    <div className="px-3 py-2 space-y-2 border-t border-border/50">
      {/* Model selector — native select avoids Radix portal issues inside canvas */}
      {models.length > 0 && (
        <select
          className="w-full border border-border bg-background rounded px-2 py-1 text-[11px] text-foreground nodrag"
          value={modelDbId ?? models[0]?.id ?? ''}
          onChange={e => onUpdateModelId?.(Number(e.target.value))}
          onClick={e => e.stopPropagation()}
        >
          {models.map(m => <option key={m.id} value={m.id}>{publicModelLabel(m)}</option>)}
        </select>
      )}

      {/* Prompt textarea */}
      <textarea
        className="w-full border border-border rounded px-2 py-1.5 text-[11px] resize-none focus:outline-none focus:ring-1 focus:ring-ring bg-background text-foreground nodrag nowheel"
        rows={3}
        placeholder={t('shared.generation.promptPlaceholder')}
        value={prompt ?? ''}
        onChange={e => onUpdatePrompt?.(e.target.value)}
        onClick={e => e.stopPropagation()}
      />

      {/* Error */}
      {error && <p className="text-[10px] text-destructive">{error}</p>}

      {/* Output preview */}
      {status === 'done' && outputUrl && outputType !== 'text' && (
        <div className="rounded overflow-hidden">
          {outputType === 'image'
            ? (resource?.direct_url
              ? <img src={outputUrl} alt="" className="w-full h-32 object-cover" />
              : <AuthedImage src={outputUrl} alt="" className="w-full h-32 object-cover" />)
            : (resource?.direct_url
              ? <video src={outputUrl} controls className="w-full h-32 object-cover" />
              : <AuthedVideo src={outputUrl} controls className="w-full h-32 object-cover" />)
          }
        </div>
      )}
      {status === 'done' && outputType === 'text' && textContent && (
        <p className="text-[11px] text-foreground bg-muted/40 rounded p-2 max-h-24 overflow-y-auto nowheel">{textContent}</p>
      )}

      {/* Run button */}
      <button
        onMouseDown={e => { e.stopPropagation(); onRun?.() }}
        disabled={isRunning}
        className={cn(
          'w-full flex items-center justify-center gap-1.5 bg-primary text-primary-foreground rounded-lg py-1.5 text-[11px] hover:bg-primary/90 transition-colors disabled:opacity-50 nodrag'
        )}
      >
        {isRunning
          ? <><Loader2 size={11} className="animate-spin" />{t('pages.jobs.generating')}</>
          : <><Wand2 size={11} />{t('shared.generation.runNode')}</>
        }
      </button>
    </div>
  )
}
