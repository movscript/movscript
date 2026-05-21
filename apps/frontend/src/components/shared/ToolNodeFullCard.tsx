import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { XCircle, Loader2, ChevronDown, History, ChevronUp } from 'lucide-react'
import { api } from '@/lib/api'
import { API_BASE_URL as API_BASE } from '@/lib/config'
import { publicModelLabel } from '@/lib/modelDisplay'
import type { RawResource, PublicModel, CanvasTask } from '@/types'
import { Card, CardHeader, CardTitle, CardContent } from '@movscript/ui'
import { GenInputCard } from './GenInputCard'
import { AuthedImage, AuthedVideo } from './AuthedImage'
import { cn } from '@/lib/utils'

export interface ToolNodeFullCardProps {
  toolName: string
  capability: 'image' | 'video'
  featureKey: string
  inputType: 'image' | 'video' | 'image+video'
  outputType: 'image' | 'video'
  prompt?: string
  onUpdatePrompt?: (p: string) => void
  modelDbId?: number
  onUpdateModelId?: (id: number) => void
  status: 'idle' | 'pending' | 'running' | 'done' | 'failed'
  resource?: RawResource
  error?: string
  onRun?: () => void
  onUpdateAttachments?: (ids: number[]) => void
  className?: string
  onCycleMode?: () => void
  // canvas context for per-node gen history
  canvasId?: string
  rfNodeId?: string
}

function TaskHistoryItem({ task, outputType, fallbackResource }: { task: CanvasTask; outputType: 'image' | 'video'; fallbackResource?: RawResource }) {
  const { t, i18n } = useTranslation()
  const resource = task.resource ?? fallbackResource
  const outputUrl = resource
    ? resource.direct_url ?? `${API_BASE}${resource.url}`
    : undefined
  const isRunning = task.status === 'pending' || task.status === 'running'
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const ts = new Date(task.CreatedAt).toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="border border-border rounded-lg overflow-hidden type-label">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/30">
        <span className={cn('type-tiny font-medium', {
          'text-amber-500': isRunning,
          'text-emerald-500': task.status === 'done',
          'text-destructive': task.status === 'failed',
        })}>
          {isRunning ? t('canvas.status.running') : task.status === 'done' ? t('canvas.status.done') : t('canvas.status.failed')}
        </span>
        <span className="text-muted-foreground ml-auto">{ts}</span>
      </div>
      {isRunning && (
        <div className="flex items-center justify-center py-4 text-muted-foreground gap-1.5">
          <Loader2 size={12} className="animate-spin" />
          <span className="type-caption">{t('pages.jobs.generating')}</span>
        </div>
      )}
      {task.status === 'failed' && (
        <div className="flex items-center gap-1.5 text-destructive px-3 py-2">
          <XCircle size={12} />
          <span className="type-caption">{task.error ?? t('pages.jobs.generationFailed')}</span>
        </div>
      )}
      {task.status === 'done' && outputUrl && (
        <div className="w-full">
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
    </div>
  )
}

export function ToolNodeFullCard({
  toolName,
  capability,
  featureKey,
  inputType,
  outputType,
  prompt,
  onUpdatePrompt,
  modelDbId,
  onUpdateModelId,
  status,
  resource,
  error,
  onRun,
  onUpdateAttachments,
  className,
  onCycleMode,
  canvasId,
  rfNodeId,
}: ToolNodeFullCardProps) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [attachments, setAttachments] = useState<RawResource[]>([])
  const [uploading, setUploading] = useState(false)
  const [historyExpanded, setHistoryExpanded] = useState(false)

  const { data: models = [] } = useQuery<PublicModel[]>({
    queryKey: ['models', capability, featureKey],
    queryFn: () => api.get(`/models?capability=${capability}&feature=${featureKey}`).then(r => r.data),
  })

  // Per-node gen history (only when inside a canvas)
  const { data: nodeTasks = [] } = useQuery<CanvasTask[]>({
    queryKey: ['canvas-node-tasks', canvasId, rfNodeId],
    queryFn: () => api.get(`/canvases/${canvasId}/nodes/${rfNodeId}/tasks`).then(r => r.data),
    enabled: !!canvasId && !!rfNodeId,
    refetchInterval: status === 'pending' || status === 'running' ? 2000 : false,
  })

  const isRunning = status === 'pending' || status === 'running'
  const canGenerate = !isRunning && !!(prompt?.trim())

  async function handleUpload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await api.post('/resources/upload', fd).then(r => r.data as RawResource)
      qc.invalidateQueries({ queryKey: ['resources'] })
      setAttachments(a => {
        const next = [...a, r]
        onUpdateAttachments?.(next.map(x => x.ID))
        return next
      })
    } finally {
      setUploading(false)
    }
  }

  const outputUrl = resource
    ? resource.direct_url ?? `${API_BASE}${resource.url}`
    : undefined

  // Latest task is nodeTasks[0] (newest first). History is the rest.
  const latestTask = nodeTasks[0]
  const historyTasks = nodeTasks.slice(1)

  return (
    <Card className={cn('w-[640px] shadow-md type-label', className)}>
      {/* CardHeader */}
      <CardHeader className="pb-3 border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="type-body font-semibold flex-1 min-w-0 truncate">{toolName}</CardTitle>
          {models.length > 0 && (
            <select
              className="border border-border bg-background rounded px-2 py-1 type-caption text-foreground nodrag shrink-0"
              value={modelDbId ?? models[0]?.id ?? ''}
              onChange={e => onUpdateModelId?.(Number(e.target.value))}
              onClick={e => e.stopPropagation()}
            >
              {models.map(m => <option key={m.id} value={m.id}>{publicModelLabel(m)}</option>)}
            </select>
          )}
          {onCycleMode && (
            <button
              title={t('shared.toolNode.switchModeTitle')}
              className="nodrag shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors type-tiny font-medium"
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onCycleMode() }}
            >
              {t('shared.toolNode.fullMode')}
              <ChevronDown size={10} className="rotate-180" />
            </button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-3">
        {/* Latest gen preview (from current node status or latest task) */}
        {latestTask && (
          <div className="space-y-1.5">
            <p className="type-caption font-medium text-muted-foreground flex items-center gap-1.5">
              <History size={12} />
              {t('shared.toolNode.latestGeneration')}
            </p>
            <TaskHistoryItem task={latestTask} outputType={outputType} fallbackResource={resource} />
          </div>
        )}

        {/* Fallback: show current node output if no task history */}
        {!latestTask && status === 'done' && outputUrl && (
          <div className="rounded-lg overflow-hidden">
            {outputType === 'image'
              ? (resource?.direct_url
                ? <img src={outputUrl} alt={t('shared.generation.resultAlt')} className="w-full h-72 object-cover" />
                : <AuthedImage src={outputUrl} alt={t('shared.generation.resultAlt')} className="w-full h-72 object-cover" />)
              : (resource?.direct_url
                ? <video src={outputUrl} controls className="w-full h-72 object-cover" />
                : <AuthedVideo src={outputUrl} controls className="w-full h-72 object-cover" />)
            }
          </div>
        )}

        {/* Running state (no task history yet) */}
        {!latestTask && isRunning && (
          <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            <span className="type-label">{status === 'pending' ? t('shared.generation.waitingStart') : t('pages.jobs.generating')}</span>
          </div>
        )}

        {/* Error state (no task history) */}
        {!latestTask && status === 'failed' && error && (
          <div className="flex items-center gap-2 text-destructive type-label">
            <XCircle size={12} /> {error}
          </div>
        )}

        {/* Input area — nodrag + stopPropagation so canvas doesn't interfere */}
        <div
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          className="nodrag nowheel"
        >
          <GenInputCard
            prompt={prompt ?? ''}
            onPromptChange={v => onUpdatePrompt?.(v)}
            attachments={attachments}
            onRemoveAttachment={i => setAttachments(a => {
              const next = a.filter((_, j) => j !== i)
              onUpdateAttachments?.(next.map(x => x.ID))
              return next
            })}
            params={[]}
            paramValues={{}}
            onParamChange={() => {}}
            onGenerate={() => onRun?.()}
            onUpload={handleUpload}
            isRunning={isRunning}
            canGenerate={canGenerate}
            selectedModelId={modelDbId ?? null}
            inputType={inputType}
            uploading={uploading}
          />
        </div>

        {/* History section */}
        {historyTasks.length > 0 && (
          <div className="border-t border-border pt-3">
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); setHistoryExpanded(v => !v) }}
              className="flex items-center justify-between w-full type-label text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="flex items-center gap-1.5 font-medium">
                <History size={12} />
                {t('shared.toolNode.generationHistory')}
                <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 type-tiny font-semibold">
                  {historyTasks.length}
                </span>
              </span>
              {historyExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {historyExpanded && (
              <div className="mt-2 space-y-2 max-h-80 overflow-y-auto nowheel">
                {historyTasks.map(task => (
                  <TaskHistoryItem key={task.ID} task={task} outputType={outputType} />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
