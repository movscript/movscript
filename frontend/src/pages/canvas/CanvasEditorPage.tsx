import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  ReactFlowProvider,
  useReactFlow,
  SelectionMode,
  ConnectionMode,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { api } from '@/lib/api'
import type { Asset, Canvas, CanvasNodeData, CanvasRun, CanvasTask, CanvasType, NodeType, PaginatedResponse, RawResource } from '@/types'
import {
  TextNode, ImageNode, VideoNode, AudioNode, ToolNode,
  InputNode, OutputNode, ApprovalNode, TextGenNode, AIGenNode, GroupNode,
} from './components/CanvasNodes'
import { ContextMenu } from './components/ContextMenu'
import { API_BASE_URL as API_BASE } from '@/lib/config'
import { NodePanel } from './components/NodePanel'
import {
  CANVAS_NODE_CATALOG,
  CANVAS_NODE_CATEGORIES,
  CANVAS_NODE_META,
  NODE_LABELS,
} from './nodeCatalog'
import { Button } from '@movscript/ui'
import { Textarea } from '@movscript/ui'
import { Label } from '@movscript/ui'
import { Badge } from '@movscript/ui'
import { cn } from '@/lib/utils'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Layers3,
  Loader2,
  MousePointer2,
  PanelRightClose,
  Play,
  Save,
  Search,
  Sparkles,
  Workflow,
  Zap,
  Lightbulb,
  HardDrive,
  Image as ImageIcon,
  Video,
  Music,
  File,
  Package,
  History,
  ListFilter,
  Clock3,
  CheckCircle2,
  XCircle,
} from 'lucide-react'

const nodeTypes = {
  text: TextNode,
  image: ImageNode,
  video: VideoNode,
  audio: AudioNode,
  canvas: ToolNode,
  ref_image_gen: ToolNode,
  ref_video_gen: ToolNode,
  multi_angle: ToolNode,
  style_transfer: ToolNode,
  motion_imitation: ToolNode,
  input: InputNode,
  output: OutputNode,
  approval: ApprovalNode,
  text_gen: TextGenNode,
  ai_gen: AIGenNode,
  group: GroupNode,
}

function genId() {
  return Math.random().toString(36).slice(2, 10)
}

function createNodeData(type: NodeType, t: (key: string) => string): Partial<CanvasNodeData> & { label: string } {
  const meta = CANVAS_NODE_META[type]
  const data = { ...(meta?.defaultData ?? { source: 'upload', label: NODE_LABELS[type] }) }
  return { ...data, label: meta ? t(meta.defaultLabelKey) : t(`canvas.nodeLabels.${type}`) }
}

function resourceToNodeType(resource: RawResource): NodeType {
  if (resource.type === 'image' || resource.type === 'video' || resource.type === 'audio' || resource.type === 'text') {
    return resource.type
  }
  return 'text'
}

function ResourceThumb({ resource }: { resource: RawResource }) {
  const url = resource.direct_url ?? (resource.url ? `${API_BASE}${resource.url}` : '')
  if (resource.type === 'image') return <img src={url} alt="" className="h-full w-full object-cover" />
  if (resource.type === 'video') return <video src={url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
  if (resource.type === 'audio') return <Music size={14} className="text-muted-foreground" />
  return <File size={14} className="text-muted-foreground" />
}

function CanvasResourceShelf({
  projectId,
  variant = 'floating',
}: {
  projectId?: number
  variant?: 'floating' | 'panel'
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'resources' | 'assets'>('resources')
  const isPanel = variant === 'panel'
  const { data: resourcePage } = useQuery<PaginatedResponse<RawResource>>({
    queryKey: ['canvas-resource-shelf', 'resources'],
    queryFn: () => api.get('/resources', { params: { page: 1, page_size: 24, type: 'image,video,audio,text' } }).then((r) => r.data),
  })
  const { data: assetPage } = useQuery<PaginatedResponse<Asset>>({
    queryKey: ['canvas-resource-shelf', 'assets', projectId],
    queryFn: () => api.get(`/projects/${projectId}/assets`, { params: { page: 1, page_size: 18 } }).then((r) => r.data),
    enabled: !!projectId,
  })
  const resources = resourcePage?.items ?? []
  const assets = assetPage?.items ?? []

  function dragResource(e: React.DragEvent, resource: RawResource) {
    e.dataTransfer.setData('application/canvas-resource', JSON.stringify(resource))
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div className={cn(
      isPanel
        ? 'flex h-full flex-col overflow-hidden bg-background'
        : 'pointer-events-auto absolute bottom-4 left-4 right-24 z-10 overflow-hidden rounded-lg border border-border bg-background/95 shadow-lg backdrop-blur'
    )}>
      <div className="flex h-9 items-center gap-2 border-b border-border px-3">
        <HardDrive size={14} className="text-muted-foreground" />
        <span className="text-xs font-semibold text-foreground">{t('canvas.editor.resourceShelf.title')}</span>
        <div className="ml-2 flex overflow-hidden rounded-md border border-border text-[11px]">
          <button
            onClick={() => setTab('resources')}
            className={cn('px-2 py-1 transition-colors', tab === 'resources' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50')}
          >
            {t('shared.resourcePanel.resourceLibrary')}
          </button>
          <button
            onClick={() => setTab('assets')}
            className={cn('border-l border-border px-2 py-1 transition-colors', tab === 'assets' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50')}
          >
            {t('shared.resourcePanel.assetLibrary')}
          </button>
        </div>
        <span className="ml-auto text-[11px] text-muted-foreground">{t('canvas.editor.resourceShelf.dragHint')}</span>
      </div>
      <div className={cn(
        'flex gap-2 overflow-x-auto p-2',
        isPanel ? 'min-h-0 flex-1' : 'h-24'
      )}>
        {tab === 'resources' && resources.map((resource) => (
          <button
            key={resource.ID}
            draggable
            onDragStart={(e) => dragResource(e, resource)}
            className="flex w-36 shrink-0 cursor-grab items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-left transition-colors hover:border-foreground/25 active:cursor-grabbing"
            title={resource.name}
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
              <ResourceThumb resource={resource} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-foreground">{resource.name}</span>
              <span className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                {resource.type === 'image' ? <ImageIcon size={10} /> : resource.type === 'video' ? <Video size={10} /> : resource.type === 'audio' ? <Music size={10} /> : <File size={10} />}
                {resource.type}
              </span>
            </span>
          </button>
        ))}
        {tab === 'resources' && resources.length === 0 && (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">{t('shared.resourcePanel.noResources')}</div>
        )}
        {tab === 'assets' && assets.map((asset) => {
          const views = asset.views?.filter((view) => view.resource) ?? []
          const first = views[0]?.resource
          return (
            <div key={asset.ID} className="flex w-44 shrink-0 flex-col gap-1 rounded-md border border-border bg-card p-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                  {first ? <ResourceThumb resource={first} /> : <Package size={13} className="text-muted-foreground" />}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{asset.name}</span>
              </div>
              <div className="flex gap-1 overflow-x-auto">
                {views.length === 0 && <span className="text-[10px] text-muted-foreground">{t('canvas.editor.resourceShelf.noAssetViews')}</span>}
                {views.map((view) => view.resource && (
                  <button
                    key={view.ID}
                    draggable
                    onDragStart={(e) => dragResource(e, view.resource!)}
                    className="flex h-9 w-9 shrink-0 cursor-grab items-center justify-center overflow-hidden rounded border border-border bg-muted active:cursor-grabbing"
                    title={view.label || view.resource.name}
                  >
                    <ResourceThumb resource={view.resource} />
                  </button>
                ))}
              </div>
            </div>
          )
        })}
        {tab === 'assets' && (!projectId || assets.length === 0) && (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            {projectId ? t('shared.resourcePanel.noAssets') : t('canvas.editor.resourceShelf.noProject')}
          </div>
        )}
      </div>
    </div>
  )
}

function formatRunTime(value: string | undefined, language: string) {
  if (!value) return '-'
  return new Date(value).toLocaleString(language, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRunDuration(run: CanvasRun) {
  if (!run.started_at) return '-'
  const end = run.finished_at ? new Date(run.finished_at).getTime() : Date.now()
  const seconds = Math.max(0, Math.round((end - new Date(run.started_at).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function RunStatusBadge({ status }: { status: CanvasRun['status'] }) {
  const { t } = useTranslation()
  if (status === 'running' || status === 'pending') {
    return (
      <Badge variant="secondary" className="gap-1 border-transparent">
        <Loader2 size={11} className="animate-spin" />
        {t(`canvas.runStatus.${status}`)}
      </Badge>
    )
  }
  if (status === 'done') {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-600">
        <CheckCircle2 size={11} />
        {t('canvas.runStatus.done')}
      </Badge>
    )
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <XCircle size={11} />
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
  onStatusFilterChange,
  onPageChange,
  onSelectRun,
}: {
  runs: CanvasRun[]
  total: number
  page: number
  pageCount: number
  statusFilter: 'all' | CanvasRun['status']
  activeRunId: number | null
  isLoading: boolean
  embedded?: boolean
  onStatusFilterChange: (status: 'all' | CanvasRun['status']) => void
  onPageChange: (page: number) => void
  onSelectRun: (runId: number) => void
}) {
  const { t, i18n } = useTranslation()
  return (
    <section className={cn(
      embedded ? 'flex h-full flex-col bg-background' : 'h-52 shrink-0 border-t border-border bg-background'
    )}>
      <div className="flex h-11 items-center gap-3 border-b border-border px-4">
        <History size={15} className="text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground">{t('canvas.editor.history.title')}</p>
          <p className="text-[10px] text-muted-foreground">{t('canvas.editor.history.description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <ListFilter size={13} className="text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value as 'all' | CanvasRun['status'])}
            className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none"
          >
            <option value="all">{t('canvas.editor.history.allStatuses')}</option>
            <option value="running">{t('canvas.runStatus.running')}</option>
            <option value="pending">{t('canvas.runStatus.pending')}</option>
            <option value="done">{t('canvas.runStatus.done')}</option>
            <option value="failed">{t('canvas.runStatus.failed')}</option>
          </select>
          <span className="hidden text-[11px] text-muted-foreground sm:inline">{t('canvas.editor.history.runsCount', { count: total })}</span>
          <Button variant="outline" size="sm" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1}>
            <ChevronLeft size={12} />
          </Button>
          <span className="w-12 text-center text-[11px] text-muted-foreground">{page}/{pageCount}</span>
          <Button variant="outline" size="sm" onClick={() => onPageChange(Math.min(pageCount, page + 1))} disabled={page >= pageCount}>
            <ChevronRight size={12} />
          </Button>
        </div>
      </div>

      <div className={cn(embedded ? 'min-h-0 flex-1 overflow-auto' : 'h-[calc(100%-2.75rem)] overflow-auto')}>
        <div className="grid grid-cols-[96px_104px_112px_1fr_120px] border-b border-border bg-muted/25 px-4 py-2 text-[11px] font-medium text-muted-foreground">
          <span>{t('canvas.editor.history.run')}</span>
          <span>{t('canvas.editor.history.status')}</span>
          <span>{t('canvas.editor.history.duration')}</span>
          <span>{t('canvas.editor.history.snapshot')}</span>
          <span className="text-right">{t('canvas.editor.history.startedAt')}</span>
        </div>
        {isLoading && (
          <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">
            <Loader2 size={14} className="mr-2 animate-spin" />
            {t('canvas.editor.history.loading')}
          </div>
        )}
        {!isLoading && runs.length === 0 && (
          <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">{t('canvas.editor.history.empty')}</div>
        )}
        {!isLoading && runs.map((run) => (
          <button
            key={run.ID}
            onClick={() => onSelectRun(run.ID)}
            className={cn(
              'grid w-full grid-cols-[96px_104px_112px_1fr_120px] items-center border-b border-border px-4 py-2 text-left text-xs transition-colors hover:bg-muted/40',
              activeRunId === run.ID && 'bg-primary/5'
            )}
          >
            <span className="font-medium text-foreground">#{run.ID}</span>
            <RunStatusBadge status={run.status} />
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock3 size={11} />
              {formatRunDuration(run)}
            </span>
            <span className="min-w-0 truncate text-muted-foreground">
              {t('canvas.editor.history.snapshotSummary', { nodes: run.snapshot_node_count ?? 0, edges: run.snapshot_edge_count ?? 0 })}
              {run.snapshot_hash && <span className="ml-2 font-mono text-[10px] text-muted-foreground/70">{run.snapshot_hash.slice(0, 8)}</span>}
              {run.error && <span className="ml-2 text-destructive">{run.error}</span>}
            </span>
            <span className="text-right text-muted-foreground">{formatRunTime(run.started_at ?? run.CreatedAt, i18n.language)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function WorkflowBottomPanel({
  projectId,
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
  activeTab: 'resources' | 'history'
  runs: CanvasRun[]
  total: number
  page: number
  pageCount: number
  statusFilter: 'all' | CanvasRun['status']
  activeRunId: number | null
  isLoading: boolean
  onTabChange: (tab: 'resources' | 'history') => void
  onStatusFilterChange: (status: 'all' | CanvasRun['status']) => void
  onPageChange: (page: number) => void
  onSelectRun: (runId: number) => void
}) {
  const { t } = useTranslation()
  return (
    <section className="h-52 shrink-0 border-t border-border bg-background">
      <div className="flex h-10 items-center gap-2 border-b border-border px-4">
        <div className="flex overflow-hidden rounded-md border border-border text-xs">
          <button
            onClick={() => onTabChange('resources')}
            className={cn('flex items-center gap-1.5 px-3 py-1.5 transition-colors', activeTab === 'resources' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
          >
            <HardDrive size={12} />
            {t('shared.resourcePanel.resourceLibrary')}
          </button>
          <button
            onClick={() => onTabChange('history')}
            className={cn('flex items-center gap-1.5 border-l border-border px-3 py-1.5 transition-colors', activeTab === 'history' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
          >
            <History size={12} />
            {t('canvas.editor.history.title')}
          </button>
        </div>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {activeTab === 'resources' ? t('canvas.editor.resourceShelf.dragHint') : t('canvas.editor.history.runsCount', { count: total })}
        </span>
      </div>
      <div className="h-[calc(100%-2.5rem)] overflow-hidden">
        {activeTab === 'resources' ? (
          <CanvasResourceShelf projectId={projectId} variant="panel" />
        ) : (
          <WorkflowRunHistory
            embedded
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
    </section>
  )
}

function CanvasEditorInner() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { screenToFlowPosition, fitView } = useReactFlow()

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [canvasName, setCanvasName] = useState('')
  const [canvasType, setCanvasType] = useState<CanvasType>('inspiration')
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [libraryCollapsed, setLibraryCollapsed] = useState(false)
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false)
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const [dropActive, setDropActive] = useState(false)

  // Workflow input dialog
  const [runDialogOpen, setRunDialogOpen] = useState(false)
  const [inputValues, setInputValues] = useState<Record<string, string>>({})
  const [activeRunId, setActiveRunId] = useState<number | null>(null)
  const [runHistoryPage, setRunHistoryPage] = useState(1)
  const [runStatusFilter, setRunStatusFilter] = useState<'all' | CanvasRun['status']>('all')
  const [workflowPanelTab, setWorkflowPanelTab] = useState<'resources' | 'history'>('resources')

  const fitViewCalledRef = useRef(false)
  const finalizedRunInvalidatedRef = useRef<number | null>(null)
  const canvasPaneRef = useRef<HTMLDivElement>(null)
  const runHistoryPageSize = 8

  // Load canvas
  const { data: canvas } = useQuery<Canvas>({
    queryKey: ['canvas', id],
    queryFn: () => api.get(`/canvases/${id}`).then((r) => r.data),
    enabled: !!id
  })

  const { data: workflowRunsPage, isLoading: workflowRunsLoading } = useQuery<PaginatedResponse<CanvasRun>>({
    queryKey: ['canvas-runs', id, runHistoryPage, runStatusFilter],
    queryFn: () => api.get(`/canvases/${id}/runs`, {
      params: {
        page: runHistoryPage,
        page_size: runHistoryPageSize,
        ...(runStatusFilter !== 'all' ? { status: runStatusFilter } : {}),
      },
    }).then((r) => r.data),
    enabled: !!id && canvasType === 'workflow',
    refetchInterval: canvasType === 'workflow' ? 2000 : false,
  })
  const workflowRuns = workflowRunsPage?.items ?? []
  const workflowRunTotal = workflowRunsPage?.total ?? 0
  const workflowRunPageCount = Math.max(1, Math.ceil(workflowRunTotal / runHistoryPageSize))

  const { data: activeRunTasks = [] } = useQuery<CanvasTask[]>({
    queryKey: ['canvas-run-tasks', id, activeRunId],
    queryFn: () => api.get(`/canvases/${id}/runs/${activeRunId}/tasks`).then((r) => r.data),
    enabled: !!id && !!activeRunId,
    refetchInterval: activeRunId && workflowRuns.find((run) => run.ID === activeRunId && (run.status === 'done' || run.status === 'failed')) ? false : activeRunId ? 2000 : false,
  })

  useEffect(() => {
    setRunHistoryPage(1)
  }, [runStatusFilter])

  useEffect(() => {
    if (!canvas || activeRunTasks.length === 0) return
    const nodeIdByDbId = new Map((canvas.nodes ?? []).map((n) => [n.ID, n.node_id]))
    setNodes((prev) => prev.map((node) => {
      const task = activeRunTasks.find((t) => (t.node_id && t.node_id === node.id) || nodeIdByDbId.get(t.canvas_node_id) === node.id)
      if (!task) return node
      const d = node.data as unknown as CanvasNodeData
      return {
        ...node,
        data: {
          ...d,
          status: task.status,
          resourceId: task.resource_id ?? d.resourceId,
          resource: task.resource ?? d.resource,
          error: task.error,
        },
      }
    }))
    const isTerminal = activeRunTasks.every((t) => t.status === 'done' || t.status === 'failed')
    if (isTerminal && activeRunId && finalizedRunInvalidatedRef.current !== activeRunId) {
      finalizedRunInvalidatedRef.current = activeRunId
      qc.invalidateQueries({ queryKey: ['canvas-runs', id] })
    } else if (!isTerminal && activeRunId) {
      finalizedRunInvalidatedRef.current = null
    }
  }, [activeRunId, activeRunTasks, canvas, id, qc, setNodes])

  useEffect(() => {
    if (!canvas) return
    setCanvasName(canvas.name)
    setCanvasType(canvas.canvas_type ?? 'inspiration')
    const loadedNodes: Node[] = (canvas.nodes ?? []).map((n) => {
      const data: CanvasNodeData = n.data ? JSON.parse(n.data) : { source: 'upload' }
      const { _parentId, _style, ...cleanData } = data as any
      const node: Node = {
        id: n.node_id,
        type: n.type,
        position: { x: n.pos_x, y: n.pos_y },
        data: { ...cleanData, label: n.label },
        ...(n.type === 'group'
          ? { zIndex: -1, style: _style ?? { width: 320, height: 240 } }
          : { style: { width: (_style?.width ?? 200) } }),
        ...(_parentId && { parentId: _parentId }),
      }
      return node
    })
    // Groups must appear before their children in the array
    const groupNodes = loadedNodes.filter(n => n.type === 'group')
    const childNodes = loadedNodes.filter(n => n.type !== 'group')
    const loadedEdges: Edge[] = (canvas.edges ?? []).map((e) => ({
      id: e.edge_id,
      source: e.source,
      target: e.target,
    }))
    setNodes([...groupNodes, ...childNodes])
    setEdges(loadedEdges)

    if (!fitViewCalledRef.current && loadedNodes.length > 0) {
      fitViewCalledRef.current = true
      setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 80)
    }
  }, [canvas])

  // Poll running nodes
  useEffect(() => {
    const runningNodes = nodes.filter((n) => {
      const d = n.data as unknown as CanvasNodeData
      return d.status === 'running' || d.status === 'pending'
    })
    if (runningNodes.length === 0) return
    const timer = setInterval(async () => {
      for (const n of runningNodes) {
        try {
          const task: CanvasTask = await api.get(`/canvases/${id}/nodes/${n.id}/task`).then((r) => r.data)
          if (task.status === 'done' || task.status === 'failed') {
            const resource = task.resource
            setNodes((prev) => prev.map((node) => {
              if (node.id !== n.id) return node
              const d = node.data as unknown as CanvasNodeData
              return { ...node, data: { ...d, status: task.status, resourceId: task.resource_id, resource, error: task.error } }
            }))
          }
        } catch (err: any) {
          if (err?.response?.status === 404) {
            setNodes((prev) => prev.map((node) => {
              if (node.id !== n.id) return node
              const d = node.data as unknown as CanvasNodeData
              return { ...node, data: { ...d, status: 'failed', error: t('canvas.editor.errors.nodeNotFound') } }
            }))
          }
        }
      }
    }, 2000)
    return () => clearInterval(timer)
  }, [nodes, id, t])

  // Save
  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: canvasName,
        nodes: nodes.map((n) => {
          const { label, onRun, onUpdateContent, onUpdatePrompt, onUpdateOutputType, onUpdateModelId, onUpdateAttachments, onApprove, onReject, onPush, onCycleMode, canvasId: _canvasId, rfNodeId: _rfNodeId, ...rest } = n.data as any
          return {
            node_id: n.id,
            type: n.type,
            label: label ?? '',
            pos_x: n.position.x,
            pos_y: n.position.y,
            // embed parentId and style into data so they survive save/load
            data: JSON.stringify({
              ...rest,
              _parentId: n.parentId ?? undefined,
              _style: n.style,
            }),
          }
        }),
        edges: edges.map((e) => ({
          edge_id: e.id,
          source: e.source,
          target: e.target,
        })),
      }
      return api.put(`/canvases/${id}`, payload)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canvas', id] })
  })

  // Run all
  const runAll = useMutation({
    mutationFn: (values?: Record<string, string>) => api.post(`/canvases/${id}/run`, { input_values: values ?? {} }).then((r) => r.data),
    onSuccess: (data) => {
      const runId = data?.run?.ID
      if (runId) setActiveRunId(runId)
      setRunStatusFilter('all')
      setRunHistoryPage(1)
      setWorkflowPanelTab('history')
      qc.invalidateQueries({ queryKey: ['canvas-runs', id] })
      setNodes((prev) => prev.map((n) => {
        const d = n.data as unknown as CanvasNodeData
        if (d.source === 'ai' || n.type === 'output') return { ...n, data: { ...d, status: 'pending', error: undefined } }
        return n
      }))
    }
  })

  // Run single node
  const runNode = useCallback(async (nodeId: string) => {
    await save.mutateAsync()
    await api.post(`/canvases/${id}/nodes/${nodeId}/run`)
    setNodes((prev) => prev.map((n) => {
      if (n.id !== nodeId) return n
      return { ...n, data: { ...n.data, status: 'pending' } }
    }))
  }, [id, save])

  // Handle workflow run: save first to ensure all nodes are persisted, then show input dialog if needed
  async function handleRunWorkflow() {
    try {
      await save.mutateAsync()
    } catch {
      return
    }
    const inputNodes = nodes.filter((n) => n.type === 'input')
    if (inputNodes.length > 0) {
      const initial: Record<string, string> = {}
      inputNodes.forEach((n) => { initial[n.id] = (n.data as any).inputValue ?? '' })
      setInputValues(initial)
      setRunDialogOpen(true)
    } else {
      runAll.mutate({})
    }
  }

  function handleConfirmRun() {
    setNodes((prev) => prev.map((n) => {
      if (n.type === 'input' && inputValues[n.id] !== undefined) {
        return { ...n, data: { ...n.data, inputValue: inputValues[n.id] } }
      }
      return n
    }))
    setRunDialogOpen(false)
    runAll.mutate(inputValues)
  }

  // Approval
  function handleApprove(nodeId: string) {
    updateNodeData(nodeId, { approvalStatus: 'approved' })
  }
  function handleReject(nodeId: string) {
    updateNodeData(nodeId, { approvalStatus: 'rejected' })
  }

  const addNodeAt = useCallback((type: NodeType, clientPosition?: { x: number; y: number }) => {
    const fallbackRect = canvasPaneRef.current?.getBoundingClientRect()
    const screenPosition = clientPosition ?? (
      fallbackRect
        ? { x: fallbackRect.left + fallbackRect.width / 2, y: fallbackRect.top + fallbackRect.height / 2 }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    )
    const position = screenToFlowPosition(screenPosition)
    const baseData = createNodeData(type, t)
    const newNode: Node = {
      id: genId(),
      type,
      position,
      data: { ...baseData },
      ...(type === 'group'
        ? { style: { width: 320, height: 240 }, zIndex: -1 }
        : { style: { width: 200 } }),
    }
    setNodes((prev) => [...prev, newNode])
  }, [screenToFlowPosition, t])

  const addResourceNodeAt = useCallback((resource: RawResource, clientPosition: { x: number; y: number }) => {
    const type = resourceToNodeType(resource)
    const position = screenToFlowPosition(clientPosition)
    const baseData = createNodeData(type, t)
    const newNode: Node = {
      id: genId(),
      type,
      position,
      data: {
        ...baseData,
        label: resource.name,
        source: 'upload',
        resourceId: resource.ID,
        resource,
        status: 'done',
      },
      style: { width: type === 'text' ? 220 : 200 },
    }
    setNodes((prev) => [...prev, newNode])
  }, [screenToFlowPosition, setNodes, t])

  // Add node from context menu
  const addNode = useCallback((type: NodeType) => {
    if (!menu) return
    addNodeAt(type, { x: menu.x, y: menu.y })
  }, [addNodeAt, menu])

  // Delete selected nodes and their connected edges (also removes children of deleted groups)
  const deleteSelectedNodes = useCallback(() => {
    const directSelected = new Set(nodes.filter(n => n.selected).map(n => n.id))
    if (directSelected.size === 0) return
    // Also collect children of any selected group nodes
    const toDelete = new Set(directSelected)
    nodes.forEach(n => { if (n.parentId && toDelete.has(n.parentId)) toDelete.add(n.id) })
    setNodes(prev => prev.filter(n => !toDelete.has(n.id)))
    setEdges(prev => prev.filter(e => !toDelete.has(e.source) && !toDelete.has(e.target)))
    setSelectedNodeIds([])
  }, [nodes, setNodes, setEdges])

  // Group selected nodes into a new group node
  const createGroupFromSelection = useCallback(() => {
    const selected = nodes.filter((n) => n.selected && n.type !== 'group')
    if (selected.length < 2) return
    const PAD = 40
    const minX = Math.min(...selected.map((n) => n.position.x)) - PAD
    const minY = Math.min(...selected.map((n) => n.position.y)) - PAD
    const maxX = Math.max(...selected.map((n) => n.position.x + (n.measured?.width ?? 208))) + PAD
    const maxY = Math.max(...selected.map((n) => n.position.y + (n.measured?.height ?? 80))) + PAD
    const groupId = genId()
    const groupNode: Node = {
      id: groupId,
      type: 'group',
      position: { x: minX, y: minY },
      style: { width: maxX - minX, height: maxY - minY },
      zIndex: -1,
      data: { source: 'manual', label: t('canvas.nodeLabels.group'), isGroup: true },
    }
    setNodes((prev) => [
      groupNode, // parent must come before children
      ...prev.map((n) => {
        if (!n.selected || n.type === 'group') return n
        // Convert to relative position, no extent:'parent' so nodes can be dragged out
        return {
          ...n,
          parentId: groupId,
          position: { x: n.position.x - minX, y: n.position.y - minY },
        }
      }),
    ])
  }, [nodes, t])

  // Drag node out of group → detach it
  const onNodeDragStop = useCallback((_: React.MouseEvent, draggedNode: Node) => {
    if (!draggedNode.parentId) return
    const parent = nodes.find(n => n.id === draggedNode.parentId)
    if (!parent) return
    const gw = (parent.style as any)?.width ?? 320
    const gh = (parent.style as any)?.height ?? 240
    const { x: nx, y: ny } = draggedNode.position
    const nw = draggedNode.measured?.width ?? 208
    const nh = draggedNode.measured?.height ?? 80
    // If the node's center is outside the group bounds, detach it
    const cx = nx + nw / 2
    const cy = ny + nh / 2
    if (cx < 0 || cy < 0 || cx > gw || cy > gh) {
      setNodes(prev => prev.map(n => {
        if (n.id !== draggedNode.id) return n
        return {
          ...n,
          parentId: undefined,
          position: {
            x: parent.position.x + draggedNode.position.x,
            y: parent.position.y + draggedNode.position.y,
          },
        }
      }))
    }
  }, [nodes])

  // Cmd+S to save
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        save.mutate()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [save])

  // Track multi-selection
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes)
    setSelectedNodeIds((prev) => {
      const next = new Set(prev)
      changes.forEach((c) => {
        if (c.type === 'select') {
          if (c.selected) next.add(c.id)
          else next.delete(c.id)
        }
      })
      return [...next]
    })
  }, [onNodesChange])

  // Update node data
  const updateNodeData = useCallback((nodeId: string, patch: Partial<CanvasNodeData & { label: string }>) => {
    setNodes((prev) => prev.map((n) => {
      if (n.id !== nodeId) return n
      return { ...n, data: { ...n.data, ...patch } }
    }))
  }, [])

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge(params, eds))
  }, [])

  // Single click — selection only, mode cycling is handled by the node's own button
  const onNodeClick = useCallback((_: React.MouseEvent, _node: Node) => {
    // intentionally empty — mode cycling moved to onCycleMode in each node
  }, [])

  const onPaneContextMenu = useCallback((e: React.MouseEvent | MouseEvent) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY })
  }, [])

  // Right-click on a selection (multi-select) → show context menu
  const onSelectionContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY })
  }, [])

  // Right-click on a single node → show context menu
  const onNodeContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDropActive(false)
    const resourcePayload = e.dataTransfer.getData('application/canvas-resource')
    if (resourcePayload) {
      try {
        const resource = JSON.parse(resourcePayload) as RawResource
        addResourceNodeAt(resource, { x: e.clientX, y: e.clientY })
      } catch {
        // Ignore malformed drag data from outside the app.
      }
      return
    }
    const type = e.dataTransfer.getData('application/canvas-node-type') as NodeType
    if (!type || !CANVAS_NODE_META[type]) return
    addNodeAt(type, { x: e.clientX, y: e.clientY })
  }, [addNodeAt, addResourceNodeAt])

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/canvas-node-type') || e.dataTransfer.types.includes('application/canvas-resource')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setDropActive(true)
    }
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget === e.target) setDropActive(false)
  }, [])

  const onNodeDragStart = useCallback((_: React.MouseEvent, node: Node) => {
    setDraggingNodeId(node.id)
  }, [])

  const handleNodeDragStop = useCallback((event: React.MouseEvent, node: Node) => {
    setDraggingNodeId(null)
    onNodeDragStop(event, node)
  }, [onNodeDragStop])

  const canRunSingleNode = canvasType === 'inspiration'
  const nodesWithHandlers = nodes.map((n) => ({
    ...n,
    data: {
      ...n.data,
      canvasId: id,
      rfNodeId: n.id,
      onRun: canRunSingleNode ? () => runNode(n.id) : undefined,
      onUpdateContent: (content: string) => updateNodeData(n.id, { textContent: content }),
      onUpdatePrompt: (prompt: string) => updateNodeData(n.id, { prompt }),
      onUpdateOutputType: (outputType: string) => updateNodeData(n.id, { outputType } as any),
      onUpdateModelId: (modelDbId: number) => updateNodeData(n.id, { modelDbId }),
      onUpdateAttachments: (ids: number[]) => updateNodeData(n.id, { inputResourceIds: ids }),
      onApprove: () => handleApprove(n.id),
      onReject: () => handleReject(n.id),
      onCycleMode: () => {
        if (n.type === 'group') return
        const modes: Array<'compact' | 'detail' | 'full'> = ['compact', 'detail', 'full']
        const current = (n.data as any).cardMode ?? 'detail'
        const next = modes[(modes.indexOf(current) + 1) % modes.length]
        updateNodeData(n.id, { cardMode: next })
      },
    }
  }))

  const inputNodes = nodes.filter((n) => n.type === 'input')
  const selectedNode = selectedNodeIds.length > 0
    ? nodes.find((n) => n.id === selectedNodeIds[selectedNodeIds.length - 1])
    : undefined
  const selectedNodeData = selectedNode?.data as (CanvasNodeData & { label?: string }) | undefined
  const runningCount = nodes.filter((n) => {
    const d = n.data as unknown as CanvasNodeData
    return d.status === 'running' || d.status === 'pending'
  }).length
  const doneCount = nodes.filter((n) => (n.data as unknown as CanvasNodeData).status === 'done').length
  const workflowStats = {
    inputs: nodes.filter((n) => n.type === 'input').length,
    processors: nodes.filter((n) => (n.data as unknown as CanvasNodeData).source === 'ai').length,
    outputs: nodes.filter((n) => n.type === 'output').length,
  }
  const activeRun = workflowRuns.find((run) => run.ID === activeRunId) ?? workflowRuns[0]
  const activeRunStatusLabel = activeRun ? t(`canvas.runStatus.${activeRun.status}`) : undefined
  const workflowRunningCount = workflowRuns.filter((run) => run.status === 'running' || run.status === 'pending').length
  const selectedNodeMeta = selectedNode?.type ? CANVAS_NODE_META[selectedNode.type as NodeType] : undefined

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <div className="h-14 shrink-0 border-b border-border bg-card/95 px-3">
        <div className="flex h-full items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/canvases')} className="h-8 w-8 shrink-0">
            <ArrowLeft size={16} />
          </Button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <input
                className="min-w-0 flex-1 border-none bg-transparent text-sm font-semibold text-foreground outline-none"
                value={canvasName}
                onChange={(e) => setCanvasName(e.target.value)}
                placeholder={t('canvas.editor.untitled')}
              />
              <Badge variant="outline" className="hidden shrink-0 gap-1 border-border font-medium text-muted-foreground sm:flex">
                <Workflow size={12} />
                {t('canvas.editor.nodesCount', { count: nodes.length })}
              </Badge>
              {runningCount > 0 && (
                <Badge variant="secondary" className="shrink-0 gap-1">
                  <Loader2 size={11} className="animate-spin" />
                  {t('canvas.editor.runningCount', { count: runningCount })}
                </Badge>
              )}
              {canvasType === 'workflow' && activeRun && activeRunStatusLabel && (
                <Badge variant={activeRun.status === 'failed' ? 'destructive' : 'outline'} className="hidden shrink-0 gap-1 sm:flex">
                  {(activeRun.status === 'running' || activeRun.status === 'pending') && <Loader2 size={11} className="animate-spin" />}
                  {t('canvas.editor.activeRun', { id: activeRun.ID, status: activeRunStatusLabel })}
                </Badge>
              )}
              {canvasType === 'workflow' && workflowRunningCount > 1 && (
                <Badge variant="secondary" className="hidden shrink-0 sm:flex">
                  {t('canvas.editor.parallelRuns', { count: workflowRunningCount })}
                </Badge>
              )}
            </div>
            <div className="mt-0.5 hidden items-center gap-2 text-[11px] text-muted-foreground md:flex">
              <span>{t('canvas.editor.stats.inputs', { count: workflowStats.inputs })}</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>{t('canvas.editor.stats.processors', { count: workflowStats.processors })}</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>{t('canvas.editor.stats.outputs', { count: workflowStats.outputs })}</span>
              <span className="h-1 w-1 rounded-full bg-border" />
              <span>{t('canvas.editor.stats.done', { count: doneCount })}</span>
            </div>
          </div>

          <Badge variant="outline" className="h-8 shrink-0 gap-1.5 px-3 text-xs font-medium">
            {canvasType === 'workflow' ? <Zap size={12} /> : <Lightbulb size={12} />}
            {t(`canvas.editor.canvasType.${canvasType}`)}
          </Badge>

          {canvasType === 'workflow' && (
            <Button onClick={handleRunWorkflow} disabled={runAll.isPending} size="sm" className="shrink-0">
              <Play size={12} /> {runAll.isPending ? t('canvas.editor.starting') : t('canvas.editor.startRun')}
            </Button>
          )}

          <Button onClick={() => save.mutate()} disabled={save.isPending} size="sm" variant="outline" className="shrink-0">
            {save.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {save.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className={cn(
          'shrink-0 border-r border-border bg-sidebar transition-all duration-200',
          libraryCollapsed ? 'w-12' : 'w-72'
        )}>
          <div className="flex h-full flex-col">
            <div className={cn(
              'flex h-12 items-center border-b border-sidebar-border',
              libraryCollapsed ? 'justify-center px-0' : 'gap-2 px-3'
            )}>
              {!libraryCollapsed && <Layers3 size={15} className="shrink-0 text-muted-foreground" />}
              {!libraryCollapsed && <span className="flex-1 text-xs font-semibold text-foreground">{t('canvas.editor.nodeLibrary')}</span>}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setLibraryCollapsed((v) => !v)}
              >
                {libraryCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
              </Button>
            </div>

            {!libraryCollapsed && (
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <div className="mb-3 flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-muted-foreground">
                  <Search size={12} />
                  <span>{t('canvas.editor.nodeLibraryHint')}</span>
                </div>
                <div className="space-y-4">
                  {CANVAS_NODE_CATEGORIES.map((category) => {
                    const items = CANVAS_NODE_CATALOG.filter((item) => item.category === category.id)
                    return (
                      <section key={category.id}>
                        <div className="mb-2">
                          <p className="text-[11px] font-semibold text-foreground">{t(category.titleKey)}</p>
                          <p className="text-[10px] leading-relaxed text-muted-foreground">{t(category.descriptionKey)}</p>
                        </div>
                        <div className="grid gap-1.5">
                          {items.map((item) => {
                            const Icon = item.icon
                            return (
                              <button
                                key={item.type}
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData('application/canvas-node-type', item.type)
                                  e.dataTransfer.effectAllowed = 'copy'
                                }}
                                onClick={() => addNodeAt(item.type)}
                                className="group flex min-h-[54px] items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-left transition-colors hover:border-foreground/25 hover:bg-background"
                              >
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-foreground">
                                  <Icon size={15} />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-xs font-medium text-foreground">{t(item.labelKey)}</span>
                                  <span className="block truncate text-[10px] text-muted-foreground">{t(item.descriptionKey)}</span>
                                </span>
                                <GripVertical size={13} className="shrink-0 text-muted-foreground/45" />
                              </button>
                            )
                          })}
                        </div>
                      </section>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div
            ref={canvasPaneRef}
            className={cn(
              'relative min-h-0 flex-1 bg-background',
              dropActive && 'ring-2 ring-inset ring-primary/35'
            )}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
          >
            <ReactFlow
              className="canvas-flow"
              nodes={nodesWithHandlers}
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onNodeContextMenu={onNodeContextMenu}
              onSelectionContextMenu={onSelectionContextMenu}
              onNodeDragStart={onNodeDragStart}
              onNodeDragStop={handleNodeDragStop}
              onPaneClick={() => setMenu(null)}
              onPaneContextMenu={onPaneContextMenu}
              nodeTypes={nodeTypes}
              defaultViewport={{ x: 0, y: 0, zoom: 1 }}
              minZoom={0.1}
              maxZoom={4}
              deleteKeyCode={['Delete', 'Backspace']}
              selectionOnDrag={true}
              panOnDrag={[1, 2]}
              selectionMode={SelectionMode.Partial}
              connectionMode={ConnectionMode.Loose}
              connectionRadius={40}
              defaultEdgeOptions={{
                type: 'smoothstep',
                markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
                style: { strokeWidth: 1.6 },
              }}
            >
              <Background gap={18} size={1} color="hsl(var(--border))" />
              <Controls position="bottom-left" />
              <MiniMap zoomable pannable position="bottom-right" nodeStrokeWidth={3} />
            </ReactFlow>

          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
              <div className="max-w-sm rounded-lg border border-dashed border-border bg-background/80 p-5 text-center shadow-sm backdrop-blur">
                <Sparkles size={20} className="mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">{t('canvas.editor.emptyTitle')}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('canvas.editor.emptyDescription')}</p>
              </div>
            </div>
          )}

          {dropActive && (
            <div className="pointer-events-none absolute inset-4 flex items-center justify-center rounded-lg border border-dashed border-primary/50 bg-primary/5 text-sm font-medium text-primary">
              {t('canvas.editor.dropToPlace')}
            </div>
          )}

          <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-md border border-border bg-background/90 px-3 py-2 text-xs text-muted-foreground shadow-sm backdrop-blur">
            <MousePointer2 size={13} />
            {draggingNodeId
              ? t('canvas.editor.status.dragging')
              : selectedNode
                ? t('canvas.editor.status.selected', { label: selectedNodeData?.label || (selectedNodeMeta ? t(selectedNodeMeta.labelKey) : selectedNode.type) })
                : t('canvas.editor.status.idle')}
          </div>

            {canvasType !== 'workflow' && <CanvasResourceShelf projectId={canvas?.project_id} />}
          </div>

          {canvasType === 'workflow' && (
            <WorkflowBottomPanel
              projectId={canvas?.project_id}
              activeTab={workflowPanelTab}
              runs={workflowRuns}
              total={workflowRunTotal}
              page={runHistoryPage}
              pageCount={workflowRunPageCount}
              statusFilter={runStatusFilter}
              activeRunId={activeRunId}
              isLoading={workflowRunsLoading}
              onTabChange={setWorkflowPanelTab}
              onStatusFilterChange={setRunStatusFilter}
              onPageChange={setRunHistoryPage}
              onSelectRun={setActiveRunId}
            />
          )}
        </div>

        <aside className={cn(
          'shrink-0 border-l border-border bg-background transition-all duration-200',
          inspectorCollapsed ? 'w-12' : 'w-80'
        )}>
          <div className="flex h-full flex-col">
            <div className="flex h-12 items-center gap-2 border-b border-border px-3">
              <PanelRightClose size={15} className="shrink-0 text-muted-foreground" />
              {!inspectorCollapsed && <span className="flex-1 text-xs font-semibold text-foreground">{t('canvas.editor.inspector')}</span>}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setInspectorCollapsed((v) => !v)}
              >
                {inspectorCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
              </Button>
            </div>

            {!inspectorCollapsed && (
              selectedNode ? (
                <NodePanel
                  nodeId={selectedNode.id}
                  canvasId={Number(id)}
                  nodeType={selectedNode.type as NodeType}
                  data={selectedNode.data as unknown as CanvasNodeData}
                  label={(selectedNode.data as any).label || (selectedNodeMeta ? t(selectedNodeMeta.defaultLabelKey) : NODE_LABELS[selectedNode.type as NodeType])}
                  allNodes={nodes}
                  edges={edges}
                  onUpdate={updateNodeData}
                  onRun={runNode}
                  allowRun={canRunSingleNode}
                />
              ) : (
                <div className="flex min-h-0 flex-1 flex-col p-4 text-sm">
                  <div className="rounded-lg border border-dashed border-border bg-muted/25 p-4">
                    <p className="text-sm font-medium text-foreground">{t('canvas.editor.noSelectionTitle')}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('canvas.editor.noSelectionDescription')}</p>
                  </div>
                  <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <span>{t('canvas.editor.currentSelection')}</span>
                      <span>{selectedNodeIds.length}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <span>{t('canvas.editor.edgesCount')}</span>
                      <span>{edges.length}</span>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </aside>
      </div>

      {/* Context menu */}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onAdd={addNode}
          onClose={() => setMenu(null)}
          selectedCount={nodes.filter((n) => n.selected && n.type !== 'group').length}
          onGroupSelected={createGroupFromSelection}
          onDeleteSelected={deleteSelectedNodes}
          hasSelection={nodes.some(n => n.selected)}
        />
      )}

      {/* Workflow input dialog */}
      {runDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-xl p-6 w-[420px] shadow-2xl space-y-4 border border-border">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{t('canvas.workflowInputTitle')}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{t('canvas.editor.workflowInputDescription')}</p>
            </div>
            {inputNodes.map((n) => (
              <div key={n.id}>
                <Label className="text-xs font-medium text-muted-foreground mb-1 block">
                  {(n.data as any).paramName || (n.data as any).label || t('canvas.nodeLabels.input')}
                  {(n.data as any).paramType && (
                    <span className="ml-1 font-normal text-muted-foreground/70">({(n.data as any).paramType})</span>
                  )}
                </Label>
                <Textarea
                  rows={3}
                  placeholder={t('canvas.inputContentPlaceholder')}
                  value={inputValues[n.id] ?? ''}
                  onChange={(e) => setInputValues((prev) => ({ ...prev, [n.id]: e.target.value }))}
                  autoFocus={inputNodes[0]?.id === n.id}
                />
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <Button onClick={handleConfirmRun} className="flex-1">
                {t('canvas.startRun')}
              </Button>
              <Button
                variant="outline"
                onClick={() => setRunDialogOpen(false)}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CanvasEditorPage() {
  return (
    <ReactFlowProvider>
      <CanvasEditorInner />
    </ReactFlowProvider>
  )
}
