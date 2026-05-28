import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { XCircle, Loader2, ChevronDown, History, ChevronUp } from 'lucide-react'
import { api } from '@/shared/infrastructure/api'
import { API_BASE_URL as API_BASE } from '@/shared/infrastructure/config'
import { publicModelLabel } from '@/shared/domain/modelDisplay'
import type { RawResource, PublicModel } from '@/types'
import { useCanvasRuntimeStore, type CanvasRuntimeTask } from '@/features/canvas/runtime/runHistoryStore'
import {
  CanvasToolFullCard,
  CanvasToolFullHistoryItem,
  CanvasToolFullHistoryList,
  CanvasToolFullHistorySection,
  CanvasToolFullHistoryToggle,
  CanvasToolFullInputRegion,
  CanvasToolFullModeButton,
  CanvasToolFullModelSelect,
  CanvasToolFullOutputFrame,
  CanvasToolFullSection,
  CanvasToolFullState,
  type StatusBadgeProps,
} from '@movscript/ui'
import { GenInputCard } from './GenInputCard'
import { AuthedImage, AuthedVideo } from '@/shared/ui/AuthedImage'

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

function TaskHistoryItem({ task, outputType, fallbackResource }: { task: CanvasRuntimeTask; outputType: 'image' | 'video'; fallbackResource?: RawResource }) {
  const { t, i18n } = useTranslation()
  const resource = task.resource ?? fallbackResource
  const outputUrl = resource
    ? resource.direct_url ?? `${API_BASE}${resource.url}`
    : undefined
  const isRunning = task.status === 'pending' || task.status === 'running'
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const ts = new Date(task.startedAt).toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  const statusProps = toolHistoryStatusRecipe(task.status)
  const statusLabel = isRunning ? t('canvas.status.running') : task.status === 'done' ? t('canvas.status.done') : t('canvas.status.failed')

  return (
    <CanvasToolFullHistoryItem statusLabel={statusLabel} statusProps={statusProps} timestamp={ts}>
      {isRunning && (
        <CanvasToolFullState icon={<Loader2 size={12} className="animate-spin" />}>
          {t('pages.jobs.generating')}
        </CanvasToolFullState>
      )}
      {task.status === 'failed' && (
        <CanvasToolFullState tone="danger" icon={<XCircle size={12} />}>
          {task.error ?? t('pages.jobs.generationFailed')}
        </CanvasToolFullState>
      )}
      {task.status === 'done' && outputUrl && (
        <CanvasToolFullOutputFrame className="canvas-tool-full-output--history">
          {outputType === 'image'
            ? <AuthedImage src={outputUrl} alt="" />
            : <AuthedVideo src={outputUrl} controls />
          }
        </CanvasToolFullOutputFrame>
      )}
    </CanvasToolFullHistoryItem>
  )
}

function toolHistoryStatusRecipe(status: CanvasRuntimeTask['status']): StatusBadgeProps {
  if (status === 'done') return { intent: 'success', emphasis: 'soft' }
  if (status === 'pending' || status === 'running') return { intent: 'warning', emphasis: 'soft' }
  return { intent: 'danger', emphasis: 'soft' }
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
  const runsByCanvasId = useCanvasRuntimeStore((s) => s.runsByCanvasId)
  const nodeTasks = canvasId && rfNodeId
    ? (runsByCanvasId[canvasId] ?? [])
      .map((run) => run.tasks[rfNodeId])
      .filter((task): task is CanvasRuntimeTask => Boolean(task))
    : []

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
    <CanvasToolFullCard
      title={toolName}
      className={className}
      modelControl={(
        <CanvasToolFullModelSelect
          models={models.map((model) => ({ value: model.id, label: publicModelLabel(model) }))}
          selectedModel={modelDbId ?? models[0]?.id ?? ''}
          onChange={(value) => onUpdateModelId?.(Number(value))}
          onClick={(event) => event.stopPropagation()}
        />
      )}
      modeAction={onCycleMode ? (
        <CanvasToolFullModeButton
          title={t('shared.toolNode.switchModeTitle')}
          icon={<ChevronDown size={10} className="rotate-180" />}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); onCycleMode() }}
        >
          {t('shared.toolNode.fullMode')}
        </CanvasToolFullModeButton>
      ) : undefined}
    >
        {/* Latest gen preview (from current node status or latest task) */}
        {latestTask && (
          <CanvasToolFullSection icon={<History size={12} />} label={t('shared.toolNode.latestGeneration')}>
            <TaskHistoryItem task={latestTask} outputType={outputType} fallbackResource={resource} />
          </CanvasToolFullSection>
        )}

        {/* Fallback: show current node output if no task history */}
        {!latestTask && status === 'done' && outputUrl && (
          <CanvasToolFullOutputFrame className="canvas-tool-full-output--current">
            {outputType === 'image'
              ? <AuthedImage src={outputUrl} alt={t('shared.generation.resultAlt')} />
              : <AuthedVideo src={outputUrl} controls />
            }
          </CanvasToolFullOutputFrame>
        )}

        {/* Running state (no task history yet) */}
        {!latestTask && isRunning && (
          <CanvasToolFullState icon={<Loader2 size={14} className="animate-spin" />}>
            {status === 'pending' ? t('shared.generation.waitingStart') : t('pages.jobs.generating')}
          </CanvasToolFullState>
        )}

        {/* Error state (no task history) */}
        {!latestTask && status === 'failed' && error && (
          <CanvasToolFullState tone="danger" icon={<XCircle size={12} />}>{error}</CanvasToolFullState>
        )}

        {/* Input area — nodrag + stopPropagation so canvas doesn't interfere */}
        <CanvasToolFullInputRegion
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
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
        </CanvasToolFullInputRegion>

        {/* History section */}
        {historyTasks.length > 0 && (
          <CanvasToolFullHistorySection>
            <CanvasToolFullHistoryToggle
              label={(
                <>
                  <History size={12} />
                  {t('shared.toolNode.generationHistory')}
                </>
              )}
              count={historyTasks.length}
              expanded={historyExpanded}
              expandedIcon={<ChevronUp size={14} />}
              collapsedIcon={<ChevronDown size={14} />}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); setHistoryExpanded(v => !v) }}
            />
            {historyExpanded && (
              <CanvasToolFullHistoryList>
                {historyTasks.map(task => (
                  <TaskHistoryItem key={task.id} task={task} outputType={outputType} />
                ))}
              </CanvasToolFullHistoryList>
            )}
          </CanvasToolFullHistorySection>
        )}
    </CanvasToolFullCard>
  )
}
