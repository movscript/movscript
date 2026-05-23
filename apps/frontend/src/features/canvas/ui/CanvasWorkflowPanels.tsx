import { useMemo, useState } from 'react'
import type { Node } from '@xyflow/react'
import { useTranslation } from 'react-i18next'
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  HardDrive,
  History,
  ListFilter,
  Loader2,
  Trash2,
  XCircle,
} from 'lucide-react'

import { AuthedImage, AuthedVideo } from '@/components/shared/AuthedImage'
import { API_BASE_URL as API_BASE } from '@/lib/config'
import { cn } from '@/lib/utils'
import { Badge, Button } from '@movscript/ui'
import type { CanvasRunStatus, ResourceBinding } from '@/types'
import type { CanvasRuntimeRun } from '@/features/canvas/runtime/runHistoryStore'
import { canvasPortValuePreviewText, workflowRunOutputItems } from '@/features/canvas/runtime/runtimeValues'
import { CanvasResourceShelf } from './CanvasResourceShelf'

function formatRunTime(value: string | undefined, language: string) {
  if (!value) return '-'
  return new Date(value).toLocaleString(language, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRunDuration(run: CanvasRuntimeRun) {
  if (!run.startedAt) return '-'
  const end = run.finishedAt ? new Date(run.finishedAt).getTime() : Date.now()
  const seconds = Math.max(0, Math.round((end - new Date(run.startedAt).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function RunStatusBadge({ status }: { status: CanvasRunStatus }) {
  const { t } = useTranslation()
  if (status === 'running' || status === 'pending') {
    return (
      <Badge variant="secondary" className="gap-1 border-transparent">
        <Loader2 size={12} className="animate-spin" />
        {t(`canvas.runStatus.${status}`)}
      </Badge>
    )
  }
  if (status === 'done') {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-600">
        <CheckCircle2 size={12} />
        {t('canvas.runStatus.done')}
      </Badge>
    )
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <XCircle size={12} />
      {t('canvas.runStatus.failed')}
    </Badge>
  )
}

function WorkflowRunHistory({
  runs,
  total,
  page,
  pageCount,
  statusFilter,
  activeRunId,
  isLoading,
  embedded = false,
  compact = false,
  onStatusFilterChange,
  onPageChange,
  onSelectRun,
}: {
  runs: CanvasRuntimeRun[]
  total: number
  page: number
  pageCount: number
  statusFilter: 'all' | CanvasRunStatus
  activeRunId: string | null
  isLoading: boolean
  embedded?: boolean
  compact?: boolean
  onStatusFilterChange: (status: 'all' | CanvasRunStatus) => void
  onPageChange: (page: number) => void
  onSelectRun: (runId: string) => void
}) {
  const { t, i18n } = useTranslation()
  return (
    <section className={cn(
      embedded ? 'flex h-full flex-col bg-background' : 'h-52 shrink-0 border-t border-border bg-background'
    )}>
      {compact ? (
        <div className="shrink-0 border-b border-border px-3 py-3">
          <div className="flex items-center gap-2">
            <History size={14} className="text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="type-label font-semibold text-foreground">{t('canvas.editor.history.title')}</p>
              <p className="type-tiny text-muted-foreground">{t('canvas.editor.history.runsCount', { count: total })}</p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value as 'all' | CanvasRunStatus)}
              className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 type-label text-foreground outline-none"
            >
              <option value="all">{t('canvas.editor.history.allStatuses')}</option>
              <option value="running">{t('canvas.runStatus.running')}</option>
              <option value="pending">{t('canvas.runStatus.pending')}</option>
              <option value="done">{t('canvas.runStatus.done')}</option>
              <option value="failed">{t('canvas.runStatus.failed')}</option>
            </select>
            <Button variant="outline" size="sm" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>
              <ChevronLeft size={12} />
            </Button>
            <span className="w-10 text-center type-caption text-muted-foreground">{page}/{pageCount}</span>
            <Button variant="outline" size="sm" onClick={() => onPageChange(Math.min(pageCount, page + 1))} disabled={page >= pageCount}>
              <ChevronRight size={12} />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex h-11 items-center gap-3 border-b border-border px-4">
          <History size={14} className="text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="type-label font-semibold text-foreground">{t('canvas.editor.history.title')}</p>
            <p className="type-tiny text-muted-foreground">{t('canvas.editor.history.description')}</p>
          </div>
          <div className="flex items-center gap-2">
            <ListFilter size={14} className="text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value as 'all' | CanvasRunStatus)}
              className="h-7 rounded-md border border-border bg-background px-2 type-label text-foreground outline-none"
            >
              <option value="all">{t('canvas.editor.history.allStatuses')}</option>
              <option value="running">{t('canvas.runStatus.running')}</option>
              <option value="pending">{t('canvas.runStatus.pending')}</option>
              <option value="done">{t('canvas.runStatus.done')}</option>
              <option value="failed">{t('canvas.runStatus.failed')}</option>
            </select>
            <span className="hidden type-caption text-muted-foreground sm:inline">{t('canvas.editor.history.runsCount', { count: total })}</span>
            <Button variant="outline" size="sm" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>
              <ChevronLeft size={12} />
            </Button>
            <span className="w-12 text-center type-caption text-muted-foreground">{page}/{pageCount}</span>
            <Button variant="outline" size="sm" onClick={() => onPageChange(Math.min(pageCount, page + 1))} disabled={page >= pageCount}>
              <ChevronRight size={12} />
            </Button>
          </div>
        </div>
      )}

      <div className={cn(embedded ? 'min-h-0 flex-1 overflow-auto' : 'h-[calc(100%-2.75rem)] overflow-auto')}>
        {isLoading && (
          <div className="flex h-24 items-center justify-center type-label text-muted-foreground">
            <Loader2 size={14} className="mr-2 animate-spin" />
            {t('canvas.editor.history.loading')}
          </div>
        )}
        {!isLoading && runs.length === 0 && (
          <div className="flex h-24 items-center justify-center type-label text-muted-foreground">{t('canvas.editor.history.empty')}</div>
        )}
        {!isLoading && runs.length > 0 && (
          compact ? (
            <div className="space-y-2 p-3">
              {runs.map((run) => (
                <button
                  key={run.id}
                  onClick={() => onSelectRun(run.id)}
                  className={cn(
                    'w-full rounded-lg border border-border bg-card p-3 text-left type-label transition-colors hover:border-foreground/25 hover:bg-muted/20',
                    activeRunId === run.id && 'border-primary/50 bg-primary/5'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">#{run.id.slice(-6)}</span>
                    <RunStatusBadge status={run.status} />
                    <span className="ml-auto type-tiny text-muted-foreground">{formatRunTime(run.startedAt, i18n.language)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 type-caption text-muted-foreground">
                    <Clock3 size={12} />
                    <span>{formatRunDuration(run)}</span>
                    <span className="h-1 w-1 rounded-full bg-border" />
                    <span>{t('canvas.editor.history.snapshotSummary', { nodes: run.snapshotNodeCount ?? 0, edges: run.snapshotEdgeCount ?? 0 })}</span>
                  </div>
                  {run.error && <p className="mt-1 truncate type-tiny text-destructive" title={run.error}>{run.error}</p>}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[96px_104px_112px_1fr_120px] border-b border-border bg-muted/25 px-4 py-2 type-caption font-medium text-muted-foreground">
                <span>{t('canvas.editor.history.run')}</span>
                <span>{t('canvas.editor.history.status')}</span>
                <span>{t('canvas.editor.history.duration')}</span>
                <span>{t('canvas.editor.history.snapshot')}</span>
                <span className="text-right">{t('canvas.editor.history.startedAt')}</span>
              </div>
              {runs.map((run) => (
                <button
                  key={run.id}
                  onClick={() => onSelectRun(run.id)}
                  className={cn(
                    'grid w-full grid-cols-[96px_104px_112px_1fr_120px] items-center border-b border-border px-4 py-2 text-left type-label transition-colors hover:bg-muted/40',
                    activeRunId === run.id && 'bg-primary/5'
                  )}
                >
                  <span className="font-medium text-foreground">#{run.id.slice(-6)}</span>
                  <RunStatusBadge status={run.status} />
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock3 size={12} />
                    {formatRunDuration(run)}
                  </span>
                  <span className="min-w-0 truncate text-muted-foreground" title={run.error || undefined}>
                    {t('canvas.editor.history.snapshotSummary', { nodes: run.snapshotNodeCount ?? 0, edges: run.snapshotEdgeCount ?? 0 })}
                    {run.error && <span className="ml-2 text-destructive">{run.error}</span>}
                  </span>
                  <span className="text-right text-muted-foreground">{formatRunTime(run.startedAt, i18n.language)}</span>
                </button>
              ))}
            </>
          )
        )}
      </div>
    </section>
  )
}

export function WorkflowSidePanel({
  projectId,
  dependencyBindings,
  activeTab,
  runs,
  total,
  page,
  pageCount,
  statusFilter,
  activeRunId,
  isLoading,
  onTabChange,
  onStatusFilterChange,
  onPageChange,
  onSelectRun,
}: {
  projectId?: number
  dependencyBindings: ResourceBinding[]
  activeTab: 'resources' | 'history'
  runs: CanvasRuntimeRun[]
  total: number
  page: number
  pageCount: number
  statusFilter: 'all' | CanvasRunStatus
  activeRunId: string | null
  isLoading: boolean
  onTabChange: (tab: 'resources' | 'history') => void
  onStatusFilterChange: (status: 'all' | CanvasRunStatus) => void
  onPageChange: (page: number) => void
  onSelectRun: (runId: string) => void
}) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(false)
  const [width, setWidth] = useState(360)
  function startResize(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = width
    function onMove(moveEvent: PointerEvent) {
      const next = Math.min(520, Math.max(300, startWidth + startX - moveEvent.clientX))
      setWidth(next)
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  if (collapsed) {
    return (
      <aside className="flex h-full w-12 shrink-0 flex-col items-center gap-2 border-l border-border bg-background py-3">
        <Button variant="ghost" size="icon-sm" onClick={() => setCollapsed(false)} title={t('canvas.editor.resourceShelf.title')}>
          <HardDrive size={14} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => {
            onTabChange('history')
            setCollapsed(false)
          }}
          title={t('canvas.editor.history.title')}
        >
          <History size={14} />
        </Button>
      </aside>
    )
  }
  return (
    <aside className="relative flex h-full shrink-0 flex-col border-l border-border bg-background" style={{ width }}>
      <button
        type="button"
        className="absolute inset-y-0 left-0 z-10 flex w-2 cursor-ew-resize items-center justify-center text-muted-foreground hover:bg-muted/50"
        onPointerDown={startResize}
        title={t('canvas.editor.resizePanel', { defaultValue: '调整面板宽度' })}
      >
        <span className="h-10 w-0.5 rounded-full bg-border" />
      </button>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border pl-4 pr-3">
        <div className="flex min-w-0 flex-1 overflow-hidden rounded-md border border-border type-label">
          <button
            onClick={() => onTabChange('resources')}
            className={cn('flex min-w-0 flex-1 items-center justify-center gap-1.5 px-2 py-1.5 transition-colors', activeTab === 'resources' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
          >
            <HardDrive size={12} />
            <span className="truncate">{t('canvas.editor.resourceShelf.title')}</span>
          </button>
          <button
            onClick={() => onTabChange('history')}
            className={cn('flex min-w-0 flex-1 items-center justify-center gap-1.5 border-l border-border px-2 py-1.5 transition-colors', activeTab === 'history' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
          >
            <History size={12} />
            <span className="truncate">{t('canvas.editor.history.title')}</span>
          </button>
        </div>
        <Button variant="ghost" size="icon-sm" className="shrink-0" onClick={() => setCollapsed(true)}>
          <ChevronRight size={14} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'resources' ? (
          <CanvasResourceShelf projectId={projectId} dependencyBindings={dependencyBindings} variant="side" />
        ) : (
          <WorkflowRunHistory
            embedded
            compact
            runs={runs}
            total={total}
            page={page}
            pageCount={pageCount}
            statusFilter={statusFilter}
            activeRunId={activeRunId}
            isLoading={isLoading}
            onStatusFilterChange={onStatusFilterChange}
            onPageChange={onPageChange}
            onSelectRun={onSelectRun}
          />
        )}
      </div>
    </aside>
  )
}

export function WorkflowRunResultsDialog({
  run,
  nodes,
  onClose,
  onRemoveResource,
  removingResourceId,
}: {
  run: CanvasRuntimeRun
  nodes: Node[]
  onClose: () => void
  onRemoveResource: (resourceId: number) => Promise<void>
  removingResourceId?: number
}) {
  const { t } = useTranslation()
  const [removedResourceIds, setRemovedResourceIds] = useState<number[]>([])
  const items = useMemo(
    () => workflowRunOutputItems(run, nodes, t('canvas.editor.runResults.output', { defaultValue: 'Output' })),
    [run, nodes, t],
  )

  async function handleRemove(resourceId: number) {
    try {
      await onRemoveResource(resourceId)
      setRemovedResourceIds((prev) => prev.includes(resourceId) ? prev : [...prev, resourceId])
    } catch {
      // Error toast is handled by the mutation owner.
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[86vh] w-full max-w-4xl flex-col rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="type-body font-semibold text-foreground">
              {t('canvas.editor.runResults.title', { id: run.id.slice(-6), defaultValue: `Run #${run.id.slice(-6)} results` })}
            </h2>
            <p className="mt-1 type-label text-muted-foreground">
              {t('canvas.editor.runResults.description', { defaultValue: 'Outputs have been saved to the resource library. Review, download, or remove the items you do not want to keep.' })}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('common.close', { defaultValue: 'Close' })}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {items.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-2 type-body text-muted-foreground">
              {t('canvas.editor.runResults.empty', { defaultValue: 'This run did not produce workflow outputs.' })}
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {items.map((item) => {
                const resource = item.resource
                const removed = !!resource && removedResourceIds.includes(resource.ID)
                const resourceUrl = resource ? `${API_BASE}${resource.url}` : undefined
                return (
                  <div key={item.key} className={cn('overflow-hidden rounded-lg border border-border bg-card', removed && 'opacity-55')}>
                    <div className="flex h-44 items-center justify-center bg-muted/35">
                      {removed ? (
                        <div className="type-label text-muted-foreground">{t('canvas.editor.runResults.removed', { defaultValue: 'Removed from resource library' })}</div>
                      ) : resource && item.value.type === 'image' ? (
                        <AuthedImage src={resourceUrl!} alt={item.label} className="h-full w-full object-contain" />
                      ) : resource && item.value.type === 'video' ? (
                        <AuthedVideo src={resourceUrl!} controls className="h-full w-full object-contain" />
                      ) : (
                        <pre className="max-h-full w-full overflow-auto whitespace-pre-wrap break-words p-3 type-label text-muted-foreground">
                          {canvasPortValuePreviewText(item.value) || t('common.empty', { defaultValue: 'Empty' })}
                        </pre>
                      )}
                    </div>
                    <div className="space-y-3 p-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate type-body font-medium text-foreground">{item.label}</span>
                          <Badge variant="outline" className="shrink-0 type-tiny">{item.value.type}</Badge>
                        </div>
                        <p className="mt-0.5 truncate type-caption text-muted-foreground">
                          {resource ? `#${resource.ID} · ${resource.name}` : item.key}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {resource && !removed && (
                          <Button asChild variant="outline" size="sm" className="flex-1">
                            <a href={resourceUrl} download={resource.name}>
                              <Download size={12} />
                              {t('common.download', { defaultValue: 'Download' })}
                            </a>
                          </Button>
                        )}
                        {resource && !removed && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 text-destructive hover:text-destructive"
                            disabled={removingResourceId === resource.ID}
                            onClick={() => handleRemove(resource.ID)}
                          >
                            {removingResourceId === resource.ID ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                            {t('canvas.editor.runResults.remove', { defaultValue: 'Remove' })}
                          </Button>
                        )}
                        {(!resource || removed) && (
                          <Button variant="outline" size="sm" className="flex-1" disabled>
                            <CheckCircle2 size={12} />
                            {removed ? t('canvas.editor.runResults.removedAction', { defaultValue: 'Removed' }) : t('canvas.editor.runResults.saved', { defaultValue: 'Saved' })}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
