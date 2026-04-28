import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ReactFlowProvider } from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import type { Canvas, CanvasRun, CanvasType } from '@/types'
import { Button } from '@movscript/ui'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/store/projectStore'
import { CanvasWorkspace, type CanvasPushTarget } from '@/pages/canvas/CanvasEditorPage'
import { CheckCircle2, Layers, Loader2, PanelLeftClose, PanelLeftOpen, Play, Plus, XCircle } from 'lucide-react'

export interface EntityDragItem {
  kind: 'script' | 'asset' | 'episode' | 'scene' | 'storyboard' | 'shot' | 'final_video'
  id: number
  label: string
  title?: string
}

export type PushTarget = CanvasPushTarget

interface Props {
  pushTargets: PushTarget[]
  onClose: () => void
}

function CanvasListItem({
  canvas,
  active,
  onSelect,
}: {
  canvas: Canvas
  active: boolean
  onSelect: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data: runsPage } = useQuery<{ items?: CanvasRun[] } | CanvasRun[]>({
    queryKey: ['canvas-runs', canvas.ID, 1, 'all'],
    queryFn: () => api.get(`/canvases/${canvas.ID}/runs`, { params: { page: 1, page_size: 1 } }).then((r) => r.data),
    enabled: canvas.canvas_type === 'workflow',
    refetchInterval: canvas.canvas_type === 'workflow' ? 2500 : false,
  })
  const runs = Array.isArray(runsPage) ? runsPage : runsPage?.items ?? []
  const latestRun = runs[0]
  const isRunning = latestRun?.status === 'running' || latestRun?.status === 'pending'
  const run = useMutation({
    mutationFn: () => api.post(`/canvases/${canvas.ID}/run`, { input_values: {} }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canvas-runs', canvas.ID] }),
  })

  const statusIcon = latestRun?.status === 'done'
    ? <CheckCircle2 size={10} className="text-emerald-500" />
    : latestRun?.status === 'failed'
    ? <XCircle size={10} className="text-destructive" />
    : isRunning
    ? <Loader2 size={10} className="animate-spin text-amber-500" />
    : null
  const statusText = latestRun?.status === 'done' ? t('canvas.status.done')
    : latestRun?.status === 'failed' ? t('canvas.status.failed')
    : isRunning ? t('canvas.status.running')
    : canvas.canvas_type === 'workflow' ? t('canvas.status.notRun') : t('canvas.types.inspiration')

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full border-b border-border/50 px-2.5 py-2 text-left transition-colors',
        active ? 'border-l-2 border-l-primary bg-background' : 'hover:bg-background/60'
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">{canvas.name}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
            {statusIcon}
            <span>{statusText}</span>
          </p>
        </div>
        {canvas.canvas_type === 'workflow' && (
          <span
            role="button"
            title={t('canvas.runCanvas')}
            onClick={(e) => {
              e.stopPropagation()
              if (!isRunning && !run.isPending) run.mutate()
            }}
            className={cn(
              'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border text-muted-foreground transition-colors',
              isRunning || run.isPending ? 'opacity-50' : 'hover:bg-muted hover:text-foreground'
            )}
          >
            {run.isPending ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
          </span>
        )}
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {canvas.canvas_type === 'workflow' ? t('canvas.types.workflow') : t('canvas.types.inspiration')}
      </p>
    </button>
  )
}

export function EmbeddedCanvas({ pushTargets, onClose }: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const projectId = useProjectStore((s) => s.current?.ID)

  const [activeCanvasId, setActiveCanvasId] = useState<number | null>(null)
  const [listCollapsed, setListCollapsed] = useState(false)

  const { data: canvases = [], isLoading: loadingList } = useQuery<Canvas[]>({
    queryKey: ['canvases-project', projectId],
    queryFn: () => api.get(`/canvases?project_id=${projectId}`).then((r) => r.data),
    enabled: !!projectId,
  })

  useEffect(() => {
    if (activeCanvasId === null && canvases.length > 0) {
      const inspiration = canvases.find((canvas) => (canvas.canvas_type ?? 'inspiration') === 'inspiration')
      setActiveCanvasId((inspiration ?? canvases[0]).ID)
    }
  }, [activeCanvasId, canvases])

  const createCanvas = useMutation({
    mutationFn: (canvasType: CanvasType = 'inspiration') =>
      api.post('/canvases', { name: t('canvas.newCanvasDefaultName'), canvas_type: canvasType, project_id: projectId }).then((r) => r.data),
    onSuccess: (data: Canvas) => {
      qc.invalidateQueries({ queryKey: ['canvases-project', projectId] })
      setActiveCanvasId(data.ID)
    },
  })

  return (
    <div className="flex h-full">
      <div className={cn(
        'flex shrink-0 flex-col overflow-hidden border-r border-border bg-card transition-all duration-200',
        listCollapsed ? 'w-11' : 'w-44'
      )}>
        <div className={cn(
          'flex items-center border-b border-border shrink-0',
          listCollapsed ? 'h-10 justify-center px-1' : 'justify-between px-2 py-1.5'
        )}>
          {!listCollapsed && (
            <span className="flex min-w-0 items-center gap-1 text-xs font-medium text-muted-foreground">
              <Layers size={11} className="shrink-0" />
              <span className="truncate">{t('canvas.canvasList')}</span>
            </span>
          )}
          {!listCollapsed && (
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => createCanvas.mutate('inspiration')}
                disabled={createCanvas.isPending}
                className="h-6 w-6"
                title={t('canvas.newCanvas')}
              >
                <Plus size={13} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setListCollapsed(true)}
                className="h-6 w-6"
                title={t('common.collapse')}
              >
                <PanelLeftClose size={13} />
              </Button>
            </div>
          )}
          {listCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setListCollapsed(false)}
              className="h-6 w-6"
              title={t('common.expand')}
            >
              <PanelLeftOpen size={13} />
            </Button>
          )}
        </div>
        {listCollapsed ? (
          <button
            type="button"
            onClick={() => setListCollapsed(false)}
            className="flex flex-1 items-start justify-center px-1 py-3 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
            title={t('canvas.canvasList')}
          >
            <Layers size={16} />
          </button>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {loadingList ? (
              <p className="p-2 text-center text-xs text-muted-foreground">{t('common.loadingShort')}</p>
            ) : canvases.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center">
                <p className="text-xs text-muted-foreground">{t('canvas.empty')}</p>
                <button
                  onClick={() => createCanvas.mutate('inspiration')}
                  className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  {t('pages.canvases.createFirst')}
                </button>
              </div>
            ) : (
              canvases.map((canvas) => (
                <CanvasListItem
                  key={canvas.ID}
                  canvas={canvas}
                  active={activeCanvasId === canvas.ID}
                  onSelect={() => setActiveCanvasId(canvas.ID)}
                />
              ))
            )}
          </div>
        )}
      </div>

      <div className="relative flex-1 overflow-hidden">
        {activeCanvasId !== null ? (
          <ReactFlowProvider>
            <CanvasWorkspace
              canvasId={activeCanvasId}
              embedded
              pushTargets={pushTargets}
              onClose={onClose}
            />
          </ReactFlowProvider>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <Layers size={28} className="opacity-30" />
            <p className="text-sm">{t('canvas.selectOrCreate')}</p>
            <button
              onClick={() => createCanvas.mutate('inspiration')}
              disabled={createCanvas.isPending}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-40"
            >
              {t('canvas.newCanvas')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
