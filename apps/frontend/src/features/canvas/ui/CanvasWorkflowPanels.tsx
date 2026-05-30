import { useMemo, useState } from 'react'
import type { Node } from '@xyflow/react'
import { useQueries, useQuery } from '@tanstack/react-query'
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
  Plus,
  Search,
  Trash2,
  Workflow,
  XCircle,
} from 'lucide-react'

import { AuthedImage, AuthedVideo } from '@/shared/ui/AuthedImage'
import { API_BASE_URL as API_BASE } from '@/shared/infrastructure/config'
import { api } from '@/shared/infrastructure/api'
import {
  Button,
  CanvasMediaFill,
  CanvasRunStatusBadge,
  CanvasWorkflowHistoryDuration,
  CanvasWorkflowHistoryView,
  CanvasWorkflowRunResultsView,
  CanvasWorkflowSideBody,
  CanvasWorkflowSideIconButton,
  CanvasWorkflowSidePanel,
  CanvasWorkflowSideRail,
  type CanvasWorkflowHistoryItem,
  type CanvasWorkflowHistoryStatusFilter,
  type CanvasWorkflowRunResultsItem,
  Input,
  PanelResizeHandle,
  useResizablePanel,
} from '@movscript/ui'
import type { Canvas, CanvasRunStatus, ResourceBinding } from '@/types'
import type { CanvasRuntimeRun } from '@/features/canvas/runtime/runHistoryStore'
import { canvasPortValuePreviewText, workflowRunOutputItems } from '@/features/canvas/runtime/runtimeValues'
import { deriveCanvasReferencePorts } from '@/features/canvas/integrations/workflowReferences'
import { CanvasResourceShelf } from './CanvasResourceShelf'

type WorkflowPanelTab = 'resources' | 'workflows' | 'history'

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
      <CanvasRunStatusBadge status={status} icon={<Loader2 size={12} />}>
        {t(`canvas.runStatus.${status}`)}
      </CanvasRunStatusBadge>
    )
  }
  if (status === 'done') {
    return (
      <CanvasRunStatusBadge status={status} icon={<CheckCircle2 size={12} />}>
        {t('canvas.runStatus.done')}
      </CanvasRunStatusBadge>
    )
  }
  return (
    <CanvasRunStatusBadge status={status} icon={<XCircle size={12} />}>
      {t('canvas.runStatus.failed')}
    </CanvasRunStatusBadge>
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
  statusFilter: CanvasWorkflowHistoryStatusFilter
  activeRunId: string | null
  isLoading: boolean
  embedded?: boolean
  compact?: boolean
  onStatusFilterChange: (status: CanvasWorkflowHistoryStatusFilter) => void
  onPageChange: (page: number) => void
  onSelectRun: (runId: string) => void
}) {
  const { t, i18n } = useTranslation()
  const historyItems: CanvasWorkflowHistoryItem[] = runs.map((run) => ({
    id: run.id,
    runLabel: `#${run.id.slice(-6)}`,
    status: <RunStatusBadge status={run.status} />,
    startedAt: formatRunTime(run.startedAt, i18n.language),
    duration: compact ? (
      <CanvasWorkflowHistoryDuration icon={<Clock3 size={12} />}>
        {formatRunDuration(run)}
      </CanvasWorkflowHistoryDuration>
    ) : (
      <>
        <Clock3 size={12} />
        {formatRunDuration(run)}
      </>
    ),
    snapshot: t('canvas.editor.history.snapshotSummary', { nodes: run.snapshotNodeCount ?? 0, edges: run.snapshotEdgeCount ?? 0 }),
    error: run.error,
  }))

  return (
    <CanvasWorkflowHistoryView
      embedded={embedded}
      compact={compact}
      icon={<History size={14} />}
      filterIcon={<ListFilter size={14} />}
      title={t('canvas.editor.history.title')}
      description={compact ? t('canvas.editor.history.runsCount', { count: total }) : t('canvas.editor.history.description')}
      loading={isLoading}
      loadingIcon={<Loader2 size={14} />}
      loadingLabel={t('canvas.editor.history.loading')}
      emptyLabel={t('canvas.editor.history.empty')}
      items={historyItems}
      tableLabels={{
        run: t('canvas.editor.history.run'),
        status: t('canvas.editor.history.status'),
        duration: t('canvas.editor.history.duration'),
        snapshot: t('canvas.editor.history.snapshot'),
        startedAt: t('canvas.editor.history.startedAt'),
      }}
      statusFilter={statusFilter}
      statusOptions={[
        { value: 'all', label: t('canvas.editor.history.allStatuses') },
        { value: 'running', label: t('canvas.runStatus.running') },
        { value: 'pending', label: t('canvas.runStatus.pending') },
        { value: 'done', label: t('canvas.runStatus.done') },
        { value: 'failed', label: t('canvas.runStatus.failed') },
      ]}
      page={page}
      pageCount={pageCount}
      previousIcon={<ChevronLeft size={12} />}
      nextIcon={<ChevronRight size={12} />}
      activeRunId={activeRunId}
      onStatusFilterChange={onStatusFilterChange}
      onPageChange={onPageChange}
      onSelectRun={onSelectRun}
    />
  )
}

function WorkflowReferencePicker({
  projectId,
  currentCanvasId,
  onAddWorkflowReference,
}: {
  projectId?: number
  currentCanvasId?: number
  onAddWorkflowReference: (workflowCanvas: Canvas) => void
}) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const { data: canvases = [], isLoading } = useQuery<Canvas[]>({
    queryKey: ['canvas-reference-workflows', projectId],
    queryFn: () => {
      const params: Record<string, string> = { type: 'workflow' }
      if (projectId) params.project_id = String(projectId)
      return api.get('/canvases', { params }).then((r) => r.data as Canvas[])
    },
  })
  const workflowDetails = useQueries({
    queries: canvases
      .filter((canvas) => canvas.ID !== currentCanvasId)
      .map((canvas) => ({
        queryKey: ['canvas', canvas.ID],
        queryFn: () => api.get(`/canvases/${canvas.ID}`).then((r) => r.data as Canvas),
        enabled: !!canvas.ID,
      })),
  })
  const workflowDetailById = useMemo(() => {
    const map = new Map<number, Canvas>()
    workflowDetails.forEach((query) => {
      if (query.data?.ID) map.set(query.data.ID, query.data)
    })
    return map
  }, [workflowDetails])
  const term = search.trim().toLowerCase()
  const workflows = canvases
    .filter((canvas) => canvas.ID !== currentCanvasId)
    .filter((canvas) => !term || canvas.name.toLowerCase().includes(term) || String(canvas.ID).includes(term))

  function dragWorkflow(event: React.DragEvent<HTMLDivElement>, canvas: Canvas) {
    event.dataTransfer.setData('application/canvas-workflow', JSON.stringify(canvas))
    event.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div className="canvas-workflow-reference-picker">
      <div className="canvas-workflow-reference-picker__search">
        <Search size={12} />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('canvas.editor.workflowReferences.search', { defaultValue: 'Search workflows' })}
        />
      </div>
      <div className="canvas-workflow-reference-picker__body">
        {isLoading ? (
          <div className="canvas-workflow-reference-picker__state">
            <Loader2 size={14} />
            {t('common.loadingShort')}
          </div>
        ) : workflows.length === 0 ? (
          <div className="canvas-workflow-reference-picker__state">
            {t('canvas.editor.workflowReferences.empty', { defaultValue: 'No workflow canvases available.' })}
          </div>
        ) : (
          <div className="canvas-workflow-reference-picker__list">
            {workflows.map((canvas) => {
              const detailedCanvas = workflowDetailById.get(canvas.ID) ?? canvas
              const ports = deriveCanvasReferencePorts(detailedCanvas)
              return (
                <div
                  key={canvas.ID}
                  draggable
                  onDragStart={(event) => dragWorkflow(event, detailedCanvas)}
                  className="canvas-workflow-reference-picker__card"
                >
                  <div className="canvas-workflow-reference-picker__card-main">
                    <span className="canvas-workflow-reference-picker__card-icon">
                      <Workflow size={14} />
                    </span>
                    <div className="canvas-workflow-reference-picker__card-text">
                      <div className="canvas-workflow-reference-picker__card-title">{canvas.name}</div>
                      <div className="canvas-workflow-reference-picker__card-meta">
                        {t('canvas.editor.workflowReferences.portSummary', { inputs: ports.inputs.length, outputs: ports.outputs.length, defaultValue: `${ports.inputs.length} inputs · ${ports.outputs.length} outputs` })}
                      </div>
                    </div>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      title={t('canvas.editor.workflowReferences.add', { defaultValue: 'Add workflow reference' })}
                      aria-label={t('canvas.editor.workflowReferences.add', { defaultValue: 'Add workflow reference' })}
                      onClick={() => onAddWorkflowReference(detailedCanvas)}
                    >
                      <Plus size={13} />
                    </Button>
                  </div>
                  <div className="canvas-workflow-reference-picker__chips">
                    {ports.inputs.slice(0, 3).map((port) => <span key={`in-${port.id}`}>in:{port.label ?? port.id}</span>)}
                    {ports.outputs.slice(0, 2).map((port) => <span key={`out-${port.id}`}>out:{port.label ?? port.id}</span>)}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export function WorkflowSidePanel({
  projectId,
  currentCanvasId,
  dependencyBindings,
  disableResourcePreviews = false,
  activeTab,
  collapsed,
  runs,
  total,
  page,
  pageCount,
  statusFilter,
  activeRunId,
  isLoading,
  onTabChange,
  onCollapsedChange,
  onStatusFilterChange,
  onPageChange,
  onSelectRun,
  onAddWorkflowReference,
}: {
  projectId?: number
  currentCanvasId?: number
  dependencyBindings: ResourceBinding[]
  disableResourcePreviews?: boolean
  activeTab: WorkflowPanelTab
  collapsed: boolean
  runs: CanvasRuntimeRun[]
  total: number
  page: number
  pageCount: number
  statusFilter: 'all' | CanvasRunStatus
  activeRunId: string | null
  isLoading: boolean
  onTabChange: (tab: WorkflowPanelTab) => void
  onCollapsedChange: (collapsed: boolean) => void
  onStatusFilterChange: (status: 'all' | CanvasRunStatus) => void
  onPageChange: (page: number) => void
  onSelectRun: (runId: string) => void
  onAddWorkflowReference: (workflowCanvas: Canvas) => void
}) {
  const { t } = useTranslation()
  const [width, setWidth] = useState(300)
  const sidePanelResize = useResizablePanel({
    size: width,
    onSizeChange: setWidth,
    minSize: 260,
    maxSize: 420,
    resizeEdge: 'left',
    ariaLabel: t('canvas.editor.resizePanel', { defaultValue: '调整面板宽度' }),
  })

  return (
    <>
      <CanvasWorkflowSideRail>
        <CanvasWorkflowSideIconButton
          onClick={() => {
            onTabChange('resources')
            onCollapsedChange(false)
          }}
          data-active={!collapsed && activeTab === 'resources' ? 'true' : undefined}
          title={t('canvas.editor.resourceShelf.title')}
          aria-label={t('canvas.editor.resourceShelf.title')}
        >
          <HardDrive size={14} />
        </CanvasWorkflowSideIconButton>
        <CanvasWorkflowSideIconButton
          onClick={() => {
            onTabChange('workflows')
            onCollapsedChange(false)
          }}
          data-active={!collapsed && activeTab === 'workflows' ? 'true' : undefined}
          title={t('canvas.editor.workflowReferences.title', { defaultValue: 'Workflow references' })}
          aria-label={t('canvas.editor.workflowReferences.title', { defaultValue: 'Workflow references' })}
        >
          <Workflow size={14} />
        </CanvasWorkflowSideIconButton>
        <CanvasWorkflowSideIconButton
          onClick={() => {
            onTabChange('history')
            onCollapsedChange(false)
          }}
          data-active={!collapsed && activeTab === 'history' ? 'true' : undefined}
          title={t('canvas.editor.history.title')}
          aria-label={t('canvas.editor.history.title')}
        >
          <History size={14} />
        </CanvasWorkflowSideIconButton>
      </CanvasWorkflowSideRail>
      {!collapsed ? (
        <CanvasWorkflowSidePanel width={width}>
          <PanelResizeHandle
            {...sidePanelResize.resizeHandleProps}
            className="canvas-workflow-side-panel__resize-handle"
            side="left"
          />
          <CanvasWorkflowSideBody>
            {activeTab === 'resources' ? (
              <CanvasResourceShelf projectId={projectId} dependencyBindings={dependencyBindings} disablePreviews={disableResourcePreviews} variant="side" />
            ) : activeTab === 'workflows' ? (
              <WorkflowReferencePicker projectId={projectId} currentCanvasId={currentCanvasId} onAddWorkflowReference={onAddWorkflowReference} />
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
          </CanvasWorkflowSideBody>
        </CanvasWorkflowSidePanel>
      ) : null}
    </>
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
  const resultItems: CanvasWorkflowRunResultsItem[] = items.map((item) => {
    const resource = item.resource
    const removed = !!resource && removedResourceIds.includes(resource.ID)
    const resourceUrl = resource ? `${API_BASE}${resource.url}` : undefined
    return {
      key: item.key,
      title: item.label,
      type: item.value.type,
      meta: resource ? `#${resource.ID} · ${resource.name}` : item.key,
      removed,
      removedLabel: t('canvas.editor.runResults.removed', { defaultValue: 'Removed from resource library' }),
      media: !removed && resource && item.value.type === 'image'
        ? <CanvasMediaFill fit="contain"><AuthedImage src={resourceUrl!} alt={item.label} /></CanvasMediaFill>
        : !removed && resource && item.value.type === 'video'
          ? <CanvasMediaFill fit="contain"><AuthedVideo src={resourceUrl!} controls /></CanvasMediaFill>
          : undefined,
      code: canvasPortValuePreviewText(item.value) || t('common.empty', { defaultValue: 'Empty' }),
      actions: resource && !removed
        ? [
            {
              key: 'download',
              href: resourceUrl,
              download: resource.name,
              icon: <Download size={12} />,
              label: t('common.download', { defaultValue: 'Download' }),
            },
            {
              key: 'remove',
              tone: 'danger' as const,
              loading: removingResourceId === resource.ID,
              onClick: () => { void handleRemove(resource.ID) },
              icon: <Trash2 size={12} />,
              label: t('canvas.editor.runResults.remove', { defaultValue: 'Remove' }),
            },
          ]
        : [
            {
              key: removed ? 'removed' : 'saved',
              disabled: true,
              icon: <CheckCircle2 size={12} />,
              label: removed ? t('canvas.editor.runResults.removedAction', { defaultValue: 'Removed' }) : t('canvas.editor.runResults.saved', { defaultValue: 'Saved' }),
            },
          ],
    }
  })

  async function handleRemove(resourceId: number) {
    try {
      await onRemoveResource(resourceId)
      setRemovedResourceIds((prev) => prev.includes(resourceId) ? prev : [...prev, resourceId])
    } catch {
      // Error toast is handled by the mutation owner.
    }
  }

  return (
    <CanvasWorkflowRunResultsView
      title={t('canvas.editor.runResults.title', { id: run.id.slice(-6), defaultValue: `Run #${run.id.slice(-6)} results` })}
      description={t('canvas.editor.runResults.description', { defaultValue: 'Outputs have been saved to the resource library. Review, download, or remove the items you do not want to keep.' })}
      closeLabel={t('common.close', { defaultValue: 'Close' })}
      emptyTitle={t('canvas.editor.runResults.empty', { defaultValue: 'This run did not produce workflow outputs.' })}
      items={resultItems}
      onClose={onClose}
    />
  )
}
