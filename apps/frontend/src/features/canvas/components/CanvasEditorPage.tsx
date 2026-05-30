import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  PanOnScrollMode,
  ViewportPortal,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { api } from '@/shared/infrastructure/api'
import type { Canvas, CanvasNodeData, CanvasParamType, CanvasPortDef, CanvasPortValue, CanvasRunStatus, CanvasType, NodeType, RawResource } from '@/types'
import {
	TextNode, ImageNode, VideoNode, ToolNode,
	InputNode, OutputNode, ResourceSinkNode, ApprovalNode, TextGenNode, AIGenNode, GroupNode, PluginCardNode,
} from '@/features/canvas/ui/CanvasNodes'
import { ContextMenu } from '@/features/canvas/ui/ContextMenu'
import { useCanvasWorkflowReferencePorts } from '@/features/canvas/integrations/workflowReferences'
import {
  fileToCanvasResourceNodeType,
  resourceToNodeType,
  uploadCanvasResourceFile,
  useCanvasResourceIntegration,
} from '@/features/canvas/integrations/resources'
import { useCanvasClientPlugins } from '@/features/canvas/integrations/clientPlugins'
import type { ClientPluginManifest } from '@/features/plugins/application/clientPlugins'
import { toast } from '@/shared/ui/toastStore'
import { useCanvasHeaderStore } from '@/features/canvas/presentation/canvasHeaderStore'
import {
  CANVAS_NODE_CATALOG,
  CANVAS_NODE_CATEGORIES,
  CANVAS_NODE_META,
} from '@/features/canvas/presentation/nodeCatalog'
import {
  canvasGroupAncestorIds,
  canvasGroupDescendantIds,
  canvasGroupSelectionBounds,
  canvasNodeGroupId,
  canvasNodeWithGroupId,
  commonCanvasGroupId,
  findCanvasGroupDropTarget,
  isCanvasNodeOutsideGroupBounds,
  resizeCanvasGroupsToFitMembers,
  resolveCanvasGroupPromotionId,
  shouldUseCanvasMediaLightweightMode,
  topLevelSelectedCanvasNodes,
} from '@/features/canvas/domain/layout'
import { compareWorkflowIoNodes, isFinalOutputNode } from '@/features/canvas/domain/graph'
import {
  arePortTypesCompatible,
  defaultHandleForNode,
  edgeConnectionKey,
  fromUiHandleId,
  portForHandle,
  portLabel,
  toUiHandleId,
} from '@/features/canvas/domain/ports'
import { useCanvasDocument } from '@/features/canvas/editor/useCanvasDocument'
import {
  createCanvasEdgeId,
  createCanvasNodeId,
  createPaletteCanvasNode,
  createPluginCanvasNode,
  createResourceCanvasNode,
  createWorkflowReferenceCanvasNode,
  isPaletteNodeTypeAvailable,
} from '@/features/canvas/editor/nodeFactory'
import { CanvasResourceShelf } from '@/features/canvas/ui/CanvasResourceShelf'
import { WorkflowRunResultsDialog, WorkflowSidePanel } from '@/features/canvas/ui/CanvasWorkflowPanels'
import { useCanvasRuntimeStore } from '@/features/canvas/runtime/runHistoryStore'
import { useCanvasRuntimeExecutor } from '@/features/canvas/runtime/useCanvasRuntimeExecutor'
import {
  defaultRuntimeValueForPort,
  encodeRuntimePortValue,
  hasValueForPort,
  portForWorkflowInputNode,
  runtimeInputPortsForNode,
} from '@/features/canvas/runtime/runtimeValues'
import {
  CanvasDropOverlay,
  CanvasEditorChrome,
  CanvasEditorChromeContent,
  CanvasEditorContent,
  CanvasEditorIconButton,
  CanvasEditorMain,
  CanvasEditorMetricBadge,
  CanvasEditorNameButton,
  CanvasEditorNameInput,
  CanvasEditorRunningBadge,
  CanvasEditorShell,
  CanvasEditorStats,
  CanvasEditorStatusBadge,
  CanvasEditorTitleArea,
  CanvasEditorTitleRow,
  CanvasEditorTypeBadge,
  CanvasPaletteCollapsedBody,
  CanvasPaletteCollapsedGroup,
  CanvasPaletteCollapsedItemButton,
  CanvasPaletteCollapsedItems,
  CanvasPaletteEmpty,
  CanvasPaletteExpandedBody,
  CanvasPaletteHeader,
  CanvasPaletteHint,
  CanvasPaletteInner,
  CanvasPaletteItemButton,
  CanvasPaletteItemGrid,
  CanvasPalettePanel,
  CanvasPaletteSection,
  CanvasPaletteSectionDescription,
  CanvasPaletteSectionHeader,
  CanvasPaletteSections,
  CanvasPaletteSectionTitle,
  CanvasRuntimeInputDialogActionButton,
  CanvasRuntimeInputDialogActions,
  CanvasRuntimeInputDialogBody,
  CanvasRuntimeInputDialogCheckbox,
  CanvasRuntimeInputDialogField,
  CanvasRuntimeInputDialogFieldLabel,
  CanvasRuntimeInputDialogHeader,
  CanvasRuntimeInputDialogInput,
  CanvasRuntimeInputDialogShell,
  CanvasRuntimeInputDialogTextarea,
  CanvasSelectionFrame,
  CanvasViewportActionButton,
  CanvasViewportBoundsLayer,
  CanvasViewportEmptyOverlay,
  CanvasViewportEmptyState,
  CanvasViewportPane,
  CanvasViewportSelectionActionButton,
  CanvasViewportStatusOverlay,
  canvasFlowBackgroundColor,
  canvasFlowClassName,
} from '@movscript/ui'
import { cn } from '@/shared/ui/cn'
import { canvasBackPath } from '@/routes/appRouteModel'
import { useInlineTitleEditor } from '@/features/canvas/presentation/useInlineTitleEditor'
import {
  ArrowLeft,
  GripVertical,
  Layers3,
  Loader2,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  Play,
  Save,
  Search,
  Sparkles,
  Workflow,
  Zap,
  Lightbulb,
  Puzzle,
  Ungroup,
} from 'lucide-react'

const nodeTypes = {
  text: TextNode,
  image: ImageNode,
  video: VideoNode,
  canvas: ToolNode,
  ref_image_gen: ToolNode,
  ref_video_gen: ToolNode,
  multi_angle: ToolNode,
  style_transfer: ToolNode,
  motion_imitation: ToolNode,
	input: InputNode,
	output: OutputNode,
	resource_sink: ResourceSinkNode,
	approval: ApprovalNode,
  text_gen: TextGenNode,
  ai_gen: AIGenNode,
  group: GroupNode,
  plugin_card: PluginCardNode,
}

const SIDEBAR_NODE_CATEGORIES = CANVAS_NODE_CATEGORIES.filter((category) => category.id !== 'media')
const SIDEBAR_HIDDEN_NODE_TYPES = new Set<NodeType>(['approval', 'resource_sink', 'canvas'])
const CANVAS_GRID_MIN_ZOOM = 0.65
const CANVAS_OVERVIEW_MIN_ZOOM = 0.45
const CANVAS_BUSY_OVERVIEW_MIN_ZOOM = 0.8
const CANVAS_OVERVIEW_NODE_LIMIT = 80
const CANVAS_MINIMAP_NODE_LIMIT = 60
const CANVAS_DEBUG_STORAGE_KEY = 'movscript.canvasDebug'

type CanvasGroupDragSnapshot = {
  nodeId: string
  position: { x: number; y: number }
  memberPositions: Map<string, { x: number; y: number }>
}

type CanvasDebugBooleanKey = 'nodes' | 'grid' | 'media' | 'images' | 'videos' | 'shelf' | 'edges' | 'shadows' | 'controls' | 'minimap' | 'visibleOnly'

type CanvasDebugOptions = Record<CanvasDebugBooleanKey, boolean> & {
  enabled: boolean
  source: string
}

const DEFAULT_CANVAS_DEBUG_OPTIONS: CanvasDebugOptions = {
  enabled: false,
  source: 'default',
  nodes: true,
  grid: true,
  media: true,
  images: true,
  videos: true,
  shelf: true,
  edges: true,
  shadows: true,
  controls: true,
  minimap: true,
  visibleOnly: true,
}

const CANVAS_DEBUG_KEY_ALIASES: Record<string, CanvasDebugBooleanKey> = {
  node: 'nodes',
  nodes: 'nodes',
  grid: 'grid',
  media: 'media',
  image: 'images',
  images: 'images',
  img: 'images',
  video: 'videos',
  videos: 'videos',
  shelf: 'shelf',
  resources: 'shelf',
  resourceShelf: 'shelf',
  edges: 'edges',
  edge: 'edges',
  shadows: 'shadows',
  shadow: 'shadows',
  controls: 'controls',
  minimap: 'minimap',
  miniMap: 'minimap',
  visible: 'visibleOnly',
  visibleOnly: 'visibleOnly',
  virtualization: 'visibleOnly',
}

function parseCanvasDebugBool(value: string | null | undefined, fallback: boolean) {
  if (value == null || value === '') return fallback
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'on', 'yes', 'y', 'enable', 'enabled'].includes(normalized)) return true
  if (['0', 'false', 'off', 'no', 'n', 'disable', 'disabled'].includes(normalized)) return false
  return fallback
}

function applyCanvasDebugSpec(options: CanvasDebugOptions, raw: string | null | undefined, source: string) {
  if (raw == null) return
  const trimmed = raw.trim()
  if (!trimmed) {
    options.enabled = true
    options.source = source
    return
  }
  const normalized = trimmed.toLowerCase()
  if (['0', 'false', 'off', 'no', 'disabled'].includes(normalized)) {
    options.enabled = false
    options.source = source
    return
  }
  options.enabled = true
  options.source = source
  if (['1', 'true', 'on', 'yes', 'enabled'].includes(normalized)) return
  for (const token of trimmed.split(/[,&;]/)) {
    const part = token.trim()
    if (!part) continue
    const [rawKey, rawValue] = part.split(/[:=]/, 2)
    const key = CANVAS_DEBUG_KEY_ALIASES[rawKey.trim()]
    if (!key) continue
    options[key] = parseCanvasDebugBool(rawValue, true)
  }
}

function parseCanvasDebugOptions(search: string): CanvasDebugOptions {
  const options: CanvasDebugOptions = { ...DEFAULT_CANVAS_DEBUG_OPTIONS }
  try {
    applyCanvasDebugSpec(options, window.localStorage.getItem(CANVAS_DEBUG_STORAGE_KEY), 'localStorage')
  } catch {
    // Ignore blocked storage in restricted browser contexts.
  }
  const params = new URLSearchParams(search)
  if (params.has('canvasDebug')) {
    applyCanvasDebugSpec(options, params.get('canvasDebug'), 'query')
  }
  for (const [param, value] of params.entries()) {
    if (!param.startsWith('canvasDebug') || param === 'canvasDebug') continue
    const rawKey = param.slice('canvasDebug'.length)
    const key = CANVAS_DEBUG_KEY_ALIASES[rawKey.charAt(0).toLowerCase() + rawKey.slice(1)]
    if (!key) continue
    options.enabled = true
    options.source = 'query'
    options[key] = parseCanvasDebugBool(value, true)
  }
  return options
}

function canvasRenderDiagnosticsEnabled(debugOptions?: CanvasDebugOptions) {
  return import.meta.env.DEV && (import.meta.env.VITE_MOVSCRIPT_AGENT_MODE_RENDER_DIAGNOSTICS === '1' || !!debugOptions?.enabled)
}

function compactCanvasDebugOptions(options: CanvasDebugOptions) {
  if (!options.enabled) return 'off'
  const flags = (Object.keys(DEFAULT_CANVAS_DEBUG_OPTIONS) as Array<keyof CanvasDebugOptions>)
    .filter((key): key is CanvasDebugBooleanKey => typeof options[key] === 'boolean')
    .map((key) => `${key}=${options[key] ? '1' : '0'}`)
    .join(',')
  return `${options.source}:${flags}`
}

function compactCanvasRect(rect: DOMRect) {
  return `${Math.round(rect.width)}x${Math.round(rect.height)}+${Math.round(rect.left)}+${Math.round(rect.top)}`
}

function compactCanvasResource(resource: RawResource | undefined) {
  if (!resource) return 'none'
  return `#${resource.ID}:${resource.type}:${resource.size ?? 0}:${resource.name}`
}

function compactCanvasMediaSrc(src: string | undefined) {
  if (!src) return 'empty'
  try {
    const url = new URL(src, window.location.origin)
    return `${url.pathname}${url.search}`
  } catch {
    return src.length > 80 ? `${src.slice(0, 80)}...` : src
  }
}

function compactCanvasMediaElement(element: HTMLImageElement | HTMLVideoElement) {
  const rect = element.getBoundingClientRect()
  const flowNode = element.closest<HTMLElement>('.react-flow__node')
  const owner = flowNode?.dataset.id ? `node:${flowNode.dataset.id}` : element.closest('.canvas-resource-shelf-card') ? 'shelf' : 'other'
  const natural = element instanceof HTMLVideoElement
    ? `${element.videoWidth}x${element.videoHeight}`
    : `${element.naturalWidth}x${element.naturalHeight}`
  return `${owner}:${compactCanvasRect(rect)}:natural=${natural}:${compactCanvasMediaSrc(element.currentSrc || element.src)}`
}

function shouldUseCanvasOverviewMode(zoom: number, nodeCount: number) {
  return zoom < CANVAS_OVERVIEW_MIN_ZOOM || (nodeCount > CANVAS_OVERVIEW_NODE_LIMIT && zoom < CANVAS_BUSY_OVERVIEW_MIN_ZOOM)
}

interface CanvasWorkspaceProps {
  canvasId: number | string
  embedded?: boolean
  useAppHeader?: boolean
  onClose?: () => void
}

export function CanvasWorkspace({ canvasId, embedded = false, useAppHeader = false, onClose }: CanvasWorkspaceProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { search } = useLocation()
  const { screenToFlowPosition, fitView } = useReactFlow()
  const id = String(canvasId)
  const canvasDebug = useMemo(() => parseCanvasDebugOptions(search), [search])

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [canvasName, setCanvasName] = useState('')
  const [canvasType, setCanvasType] = useState<CanvasType>('inspiration')
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [libraryCollapsed, setLibraryCollapsed] = useState(true)
  const toggleLibraryCollapsed = useCallback(() => setLibraryCollapsed((value) => !value), [])
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const [dropActive, setDropActive] = useState(false)
  const viewportZoomRef = useRef(1)
  const viewportPositionRef = useRef({ x: 0, y: 0 })
  const groupDragSnapshotRef = useRef<CanvasGroupDragSnapshot | null>(null)
  const [gridZoomEligible, setGridZoomEligible] = useState(true)
  const [canvasOverviewMode, setCanvasOverviewMode] = useState(false)
  const [canvasMediaLightweightMode, setCanvasMediaLightweightMode] = useState(false)
  const renderDiagnosticsTimerRef = useRef<number | null>(null)

  // Workflow input dialog
  const [runDialogOpen, setRunDialogOpen] = useState(false)
  const [inputValues, setInputValues] = useState<Record<string, string>>({})
  const [nodeRunDialog, setNodeRunDialog] = useState<{ nodeId: string; ports: CanvasPortDef[] } | null>(null)
  const [nodeRunValues, setNodeRunValues] = useState<Record<string, string>>({})
	  const [activeRunId, setActiveRunId] = useState<string | null>(null)
	  const [runHistoryPage, setRunHistoryPage] = useState(1)
	  const [runStatusFilter, setRunStatusFilter] = useState<'all' | CanvasRunStatus>('all')
	  const [workflowPanelTab, setWorkflowPanelTab] = useState<'resources' | 'workflows' | 'history'>('resources')
  const [workflowPanelCollapsed, setWorkflowPanelCollapsed] = useState(false)
  const toggleWorkflowPanelCollapsed = useCallback(() => setWorkflowPanelCollapsed((value) => !value), [])
	  const [runResultDialogRunId, setRunResultDialogRunId] = useState<string | null>(null)
  const [runtimeStarting, setRuntimeStarting] = useState(false)

  const pendingResultRunIdsRef = useRef<Set<string>>(new Set())
  const canvasPaneRef = useRef<HTMLDivElement>(null)
  const runHistoryPageSize = 8
	  const setCanvasHeader = useCanvasHeaderStore((s) => s.setHeader)
	  const resetCanvasHeader = useCanvasHeaderStore((s) => s.reset)
	  const runtimeRunsByCanvasId = useCanvasRuntimeStore((s) => s.runsByCanvasId)

  // Load canvas
  const { data: canvas } = useQuery<Canvas>({
    queryKey: ['canvas', id],
    queryFn: () => api.get(`/canvases/${id}`).then((r) => r.data),
    enabled: !!id
  })
  const renameCanvas = useMutation({
    mutationFn: (name: string) => api.patch(`/canvases/${id}`, { name }).then((response) => response.data as Canvas),
    onMutate: async (name) => {
      const nextName = name.trim()
      await queryClient.cancelQueries({ queryKey: ['canvas', id] })
      const previousCanvas = queryClient.getQueryData<Canvas>(['canvas', id])
      setCanvasName(nextName)
      if (previousCanvas) {
        queryClient.setQueryData<Canvas>(['canvas', id], { ...previousCanvas, name: nextName })
      }
      return { previousCanvas }
    },
    onError: (err: any, _name, context) => {
      if (context?.previousCanvas) {
        queryClient.setQueryData(['canvas', id], context.previousCanvas)
        setCanvasName(context.previousCanvas.name)
      }
      toast.error(err?.response?.data?.error || err?.message || t('canvas.editor.renameFailed', { defaultValue: '重命名失败' }))
    },
    onSuccess: (nextCanvas) => {
      queryClient.setQueryData<Canvas>(['canvas', id], (current) => current ? { ...current, name: nextCanvas.name } : nextCanvas)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['canvases'] })
    },
  })
  const {
    hasUnsavedChanges,
    autoSaveState,
    setAutoSaveState,
    persistCanvasGraph,
    save,
  } = useCanvasDocument({
    canvasId: id,
    canvas,
    canvasType,
    nodes,
    edges,
    runtimeStarting,
    setCanvasName,
    setCanvasType,
    setNodes,
    setEdges,
    fitView,
    t,
  })
  const {
    dependencyBindings: canvasDependencyBindings,
    nodeResources: canvasNodeResources,
    nodeResourceById: canvasNodeResourceById,
    removingRunResultResourceId,
    removeRunResultResource,
  } = useCanvasResourceIntegration({
    canvas,
    canvasId: id,
    removeFailedMessage: t('canvas.editor.runResults.removeFailed', { defaultValue: 'Failed to remove resource' }),
  })
  const {
    clientPlugins,
    runLocalPluginNode,
  } = useCanvasClientPlugins({
    nodes,
    edges,
    setNodes,
    resourceById: canvasNodeResourceById,
    pluginNotFoundMessage: t('plugins.notFound'),
  })
  const {
    executeCanvasRuntime,
    submitRunNode,
  } = useCanvasRuntimeExecutor({
    canvasId: id,
    projectId: canvas?.project_id,
    nodes,
    edges,
    setNodes,
    resourceById: canvasNodeResourceById,
    persistCanvasGraph,
    onRunStarted: ({ runId, targetNodeId }) => {
      setActiveRunId(runId)
      setRunStatusFilter('all')
      setRunHistoryPage(1)
      setWorkflowPanelTab('history')
      if (!targetNodeId) pendingResultRunIdsRef.current.add(runId)
    },
    t,
  })
  useCanvasWorkflowReferencePorts({ nodes, setNodes })
  const titleEditor = useInlineTitleEditor({
    value: canvasName,
    onCommit: (name) => renameCanvas.mutate(name),
  })

	  const workflowRunsAll = runtimeRunsByCanvasId[id] ?? []
	  const workflowRunsFiltered = runStatusFilter === 'all'
	    ? workflowRunsAll
	    : workflowRunsAll.filter((run) => run.status === runStatusFilter)
	  const workflowRunTotal = workflowRunsFiltered.length
	  const workflowRunPageCount = Math.max(1, Math.ceil(workflowRunTotal / runHistoryPageSize))
	  const workflowRuns = workflowRunsFiltered.slice((runHistoryPage - 1) * runHistoryPageSize, runHistoryPage * runHistoryPageSize)
	  const activeRun = workflowRunsAll.find((run) => run.id === activeRunId) ?? workflowRunsAll[0]

	  const resultDialogRun = runResultDialogRunId
	    ? workflowRunsAll.find((run) => run.id === runResultDialogRunId)
	    : undefined

	  const selectedNodeId = selectedNodeIds.length > 0 ? selectedNodeIds[selectedNodeIds.length - 1] : undefined

  useEffect(() => {
    setRunHistoryPage(1)
  }, [runStatusFilter])

	  useEffect(() => {
	    if (canvasType !== 'workflow' || !activeRun) return
	    if (activeRun.status !== 'done' || Object.keys(activeRun.outputValues ?? {}).length === 0) return
	    if (!pendingResultRunIdsRef.current.has(activeRun.id)) return
	    pendingResultRunIdsRef.current.delete(activeRun.id)
	    setRunResultDialogRunId(activeRun.id)
	  }, [activeRun?.id, activeRun?.outputValues, activeRun?.status, canvasType])

  const runNode = useCallback(async (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId)
    if (node?.type === 'input') {
      const port = portForWorkflowInputNode(node)
      const data = node.data as Partial<CanvasNodeData>
      setNodeRunValues({ [port.id]: data.inputValue ?? defaultRuntimeValueForPort(port) })
      setNodeRunDialog({ nodeId, ports: [port] })
      return
    }
    const workflowInputKeys = new Set<string>()
    nodes.forEach((item) => {
      if (item.type !== 'input') return
      const data = item.data as Partial<CanvasNodeData>
      if (data.inputValue === undefined) return
      workflowInputKeys.add(item.id)
      if (data.paramName) workflowInputKeys.add(data.paramName)
    })
    const ports = runtimeInputPortsForNode(node, edges).filter((port) => {
      if (node?.type !== 'canvas') return true
      return !workflowInputKeys.has(port.id) && !workflowInputKeys.has(port.label ?? '')
    })
    if (ports.length > 0) {
      setNodeRunValues(Object.fromEntries(ports.map((port) => [port.id, defaultRuntimeValueForPort(port)])))
      setNodeRunDialog({ nodeId, ports })
      return
    }
    await submitRunNode(nodeId)
  }, [edges, nodes, submitRunNode])

  const handleConfirmNodeRun = useCallback(async () => {
    if (!nodeRunDialog) return
    const encoded: Record<string, CanvasPortValue> = {}
    const runtimeInputText = nodeRunValues[nodeRunDialog.ports[0]?.id ?? ''] ?? ''
    for (const port of nodeRunDialog.ports) {
      const value = encodeRuntimePortValue(port, nodeRunValues[port.id] ?? '')
      if (!value) {
        toast.error(t('canvas.editor.errors.invalidRuntimeInput', { port: port.label ?? port.id, defaultValue: `Invalid input for ${port.label ?? port.id}` }))
        return
      }
      if (!hasValueForPort([value]) && port.required) {
        toast.error(t('canvas.editor.errors.requiredRuntimeInput', { port: port.label ?? port.id, defaultValue: `${port.label ?? port.id} is required` }))
        return
      }
      if (hasValueForPort([value])) encoded[port.id] = value
    }
    setNodeRunDialog(null)
    setNodeRunValues({})
    setNodes((prev) => prev.map((n) => {
      if (n.id === nodeRunDialog.nodeId && n.type === 'input') {
        return { ...n, data: { ...n.data, inputValue: runtimeInputText } }
      }
      return n
    }))
    await submitRunNode(nodeRunDialog.nodeId, encoded)
  }, [nodeRunDialog, nodeRunValues, setNodes, submitRunNode, t])

	  // Handle workflow run from the current in-memory graph.
	  async function handleRunWorkflow() {
	    const inputNodes = nodes.filter((n) => n.type === 'input')
	    if (inputNodes.length > 0) {
      const initial: Record<string, string> = {}
      inputNodes.forEach((n) => {
        const data = n.data as Partial<CanvasNodeData>
        initial[n.id] = data.inputValue ?? defaultRuntimeValueForPort(portForWorkflowInputNode(n))
      })
	      setInputValues(initial)
	      setRunDialogOpen(true)
	    } else {
	      setRuntimeStarting(true)
	      try {
	        await executeCanvasRuntime(undefined, {})
	      } finally {
	        setRuntimeStarting(false)
	      }
	    }
	  }

  function handleConfirmRun() {
    const encoded: Record<string, CanvasPortValue> = {}
    for (const node of inputNodes) {
      const port = portForWorkflowInputNode(node)
      const value = encodeRuntimePortValue(port, inputValues[node.id] ?? '')
      if (!value) {
        toast.error(t('canvas.editor.errors.invalidRuntimeInput', { port: port.label ?? node.id, defaultValue: `Invalid input for ${port.label ?? node.id}` }))
        return
      }
      if (!hasValueForPort([value]) && port.required) {
        toast.error(t('canvas.editor.errors.requiredRuntimeInput', { port: port.label ?? node.id, defaultValue: `${port.label ?? node.id} is required` }))
        return
      }
      if (hasValueForPort([value])) encoded[node.id] = value
    }
    setNodes((prev) => prev.map((n) => {
      if (n.type === 'input' && inputValues[n.id] !== undefined) {
        return { ...n, data: { ...n.data, inputValue: inputValues[n.id] } }
      }
      return n
	    }))
	    setRunDialogOpen(false)
	    setRuntimeStarting(true)
	    void executeCanvasRuntime(undefined, encoded).finally(() => setRuntimeStarting(false))
	  }

  // Approval
  function handleApprove(nodeId: string) {
    updateNodeData(nodeId, { approvalStatus: 'approved' })
  }
  function handleReject(nodeId: string) {
    updateNodeData(nodeId, { approvalStatus: 'rejected' })
  }

  const addNodeAt = useCallback((type: NodeType, clientPosition?: { x: number; y: number }) => {
    if (!isPaletteNodeTypeAvailable(type, canvasType) || SIDEBAR_HIDDEN_NODE_TYPES.has(type)) return
    const fallbackRect = canvasPaneRef.current?.getBoundingClientRect()
    const screenPosition = clientPosition ?? (
      fallbackRect
        ? { x: fallbackRect.left + fallbackRect.width / 2, y: fallbackRect.top + fallbackRect.height / 2 }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    )
    const position = screenToFlowPosition(screenPosition)
    setNodes((prev) => [...prev, createPaletteCanvasNode({ type, position, t, existingNodes: prev })])
  }, [canvasType, screenToFlowPosition, t])

  const addResourceNodeAt = useCallback((resource: RawResource, clientPosition: { x: number; y: number }) => {
    const type = resourceToNodeType(resource)
    if (!type) {
      toast.error('暂不支持将该素材加入画布')
      return
    }
    const position = screenToFlowPosition(clientPosition)
    const newNode = createResourceCanvasNode({ resource, type, position, t })
    setNodes((prev) => [...prev, newNode])
  }, [screenToFlowPosition, setNodes, t])

  const addResourceNodeAtFlowPosition = useCallback((resource: RawResource, position: { x: number; y: number }) => {
    const type = resourceToNodeType(resource)
    if (!type) {
      toast.error('暂不支持将该素材加入画布')
      return false
    }
    const newNode = createResourceCanvasNode({ resource, type, position, t })
    setNodes((prev) => [...prev, newNode])
    return true
  }, [setNodes, t])

  const addWorkflowReferenceNodeAt = useCallback(async (workflowCanvas: Canvas, clientPosition: { x: number; y: number }) => {
    if (String(workflowCanvas.ID) === id) {
      toast.error(t('canvas.editor.errors.selfReferenceWorkflow', { defaultValue: 'A canvas cannot reference itself.' }))
      return
    }
    try {
      const referencedCanvas = workflowCanvas.nodes
        ? workflowCanvas
        : await api.get(`/canvases/${workflowCanvas.ID}`).then((r) => r.data as Canvas)
      if ((referencedCanvas.canvas_type ?? 'inspiration') !== 'workflow') return
      const position = screenToFlowPosition(clientPosition)
      const newNode = createWorkflowReferenceCanvasNode({ workflowCanvas: referencedCanvas, position, t })
      setNodes((prev) => [...prev, newNode])
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || t('canvas.editor.errors.workflowReferenceFailed', { defaultValue: 'Failed to add workflow reference.' }))
    }
  }, [id, screenToFlowPosition, setNodes, t])

  const addPluginNodeAt = useCallback((plugin: ClientPluginManifest, clientPosition?: { x: number; y: number }) => {
    const fallbackRect = canvasPaneRef.current?.getBoundingClientRect()
    const screenPosition = clientPosition ?? (
      fallbackRect
        ? { x: fallbackRect.left + fallbackRect.width / 2, y: fallbackRect.top + fallbackRect.height / 2 }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    )
    const position = screenToFlowPosition(screenPosition)
    const newNode = createPluginCanvasNode({ plugin, position })
    setNodes((prev) => [...prev, newNode])
  }, [screenToFlowPosition, setNodes])

  // Add node from context menu
  const addNode = useCallback((type: NodeType) => {
    if (!menu) return
    addNodeAt(type, { x: menu.x, y: menu.y })
  }, [addNodeAt, menu])

  // Delete selected nodes. Lightweight groups are removed as containers while members are promoted.
  const deleteSelectedNodes = useCallback(() => {
    const selectedGroups = nodes.filter(n => n.selected && n.type === 'group')
    const directSelected = new Set(nodes.filter(n => n.selected && !isFinalOutputNode(n)).map(n => n.id))
    if (directSelected.size === 0) return
    const selectedGroupParentById = new Map<string, string | undefined>(
      selectedGroups.map((node): [string, string | undefined] => [node.id, canvasNodeGroupId(node)]),
    )
    setNodes(prev => prev.flatMap((node) => {
      if (directSelected.has(node.id)) return []
      const groupId = canvasNodeGroupId(node)
      if (!groupId || !selectedGroupParentById.has(groupId)) return node
      return canvasNodeWithGroupId(node, resolveCanvasGroupPromotionId(groupId, selectedGroupParentById))
    }))
    setEdges(prev => prev.filter(e => !directSelected.has(e.source) && !directSelected.has(e.target)))
    setSelectedNodeIds([])
  }, [nodes, setNodes, setEdges])

  // Group selected nodes into a new group node
  const createGroupFromSelection = useCallback(() => {
    const selected = topLevelSelectedCanvasNodes(nodes, nodes.filter((n) => n.selected && !isFinalOutputNode(n)))
    const bounds = canvasGroupSelectionBounds(nodes, selected)
    if (!bounds) return
    const groupId = createCanvasNodeId()
    const parentGroupId = commonCanvasGroupId(selected)
    const groupNode: Node = {
      id: groupId,
      type: 'group',
      position: { x: bounds.x, y: bounds.y },
      style: { width: bounds.width, height: bounds.height },
      zIndex: -1,
      data: {
        source: 'manual',
        label: t('canvas.nodeLabels.group'),
        isGroup: true,
        ...(parentGroupId ? { groupId: parentGroupId } : {}),
      },
      selected: true,
    }
    const selectedIds = new Set(selected.map((node) => node.id))
    setNodes((prev) => {
      const nextNodes = prev.map((n) => {
        if (!selectedIds.has(n.id)) return n
        const absolutePosition = bounds.absolutePositionByNodeId.get(n.id) ?? n.position
        return canvasNodeWithGroupId({
          ...n,
          position: absolutePosition,
          selected: false,
        }, groupId)
      })
      return [
        groupNode,
        ...nextNodes,
      ]
    })
    setSelectedNodeIds([groupId])
  }, [nodes, setNodes, t])

  const ungroupSelectedGroups = useCallback(() => {
    const selectedGroups = topLevelSelectedCanvasNodes(nodes, nodes.filter((node) => node.selected && node.type === 'group'))
    if (selectedGroups.length === 0) return
    const selectedGroupIds = new Set(selectedGroups.map((node) => node.id))
    const groupParentById = new Map<string, string | undefined>(
      selectedGroups.map((node): [string, string | undefined] => [node.id, canvasNodeGroupId(node)]),
    )
    const promotedNodeIds = nodes
      .filter((node) => selectedGroupIds.has(canvasNodeGroupId(node) ?? ''))
      .map((node) => node.id)
    setNodes((prev) => {
      const nextNodes = prev.flatMap((node) => {
        if (selectedGroupIds.has(node.id)) return []
        const groupId = canvasNodeGroupId(node)
        if (!groupId || !selectedGroupIds.has(groupId)) return node
        return [{ ...canvasNodeWithGroupId(node, resolveCanvasGroupPromotionId(groupId, groupParentById)), selected: true }]
      })
      return resizeCanvasGroupsToFitMembers(nextNodes, nextNodes.filter((node) => node.type === 'group').map((node) => node.id))
    })
    setSelectedNodeIds(promotedNodeIds)
  }, [nodes, setNodes])

  // Drag group containers by moving their lightweight members in batch.
  const onNodeDragStop = useCallback((_: React.MouseEvent, draggedNode: Node) => {
    const dragSnapshot = groupDragSnapshotRef.current
    groupDragSnapshotRef.current = null
    let nextNodes = nodes.map((node) => node.id === draggedNode.id ? draggedNode : node)
    if (draggedNode.type === 'group' && dragSnapshot?.nodeId === draggedNode.id) {
      const dx = draggedNode.position.x - dragSnapshot.position.x
      const dy = draggedNode.position.y - dragSnapshot.position.y
      if (dx !== 0 || dy !== 0) {
        nextNodes = nextNodes.map((node) => {
          const startPosition = dragSnapshot.memberPositions.get(node.id)
          if (!startPosition) return node
          return {
            ...node,
            position: {
              x: startPosition.x + dx,
              y: startPosition.y + dy,
            },
          }
        })
      }
    }

    const currentDraggedNode = nextNodes.find((node) => node.id === draggedNode.id) ?? draggedNode
    const currentGroupId = canvasNodeGroupId(currentDraggedNode)
    const currentGroup = currentGroupId ? nextNodes.find((node) => node.id === currentGroupId) : undefined
    const outsideCurrentGroup = currentGroup ? isCanvasNodeOutsideGroupBounds(currentDraggedNode, currentGroup) : false
    const excludedGroupIds = currentGroupId && currentGroup && !outsideCurrentGroup
      ? canvasGroupAncestorIds(nextNodes, currentGroupId)
      : []
    const targetGroup = findCanvasGroupDropTarget(currentDraggedNode, nextNodes, { excludedGroupIds })

    if (targetGroup) {
      const ok = window.confirm(t('canvas.editor.confirmAddToGroup', {
        defaultValue: '节点已移动到分组内，是否加入该分组？',
      }))
      if (ok) {
        setNodes(resizeCanvasGroupsToFitMembers(
          nextNodes.map((node) => node.id === currentDraggedNode.id ? canvasNodeWithGroupId(node, targetGroup.id) : node),
          [targetGroup.id, currentGroupId],
        ))
        return
      }
    }

    if (currentGroup && outsideCurrentGroup) {
      const ok = window.confirm(t('canvas.editor.confirmRemoveFromGroup', {
        defaultValue: '节点已移出当前分组，是否从分组中移除？',
      }))
      setNodes(ok
        ? resizeCanvasGroupsToFitMembers(
          nextNodes.map((node) => node.id === currentDraggedNode.id ? canvasNodeWithGroupId(node, undefined) : node),
          [currentGroupId],
        )
        : resizeCanvasGroupsToFitMembers(nextNodes, [currentGroupId]))
      return
    }

    if (nextNodes !== nodes) setNodes(nextNodes)
  }, [nodes, setNodes, t])

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
    const protectedIds = new Set(nodes.filter(isFinalOutputNode).map((node) => node.id))
    const filteredChanges = changes.filter((change) => change.type !== 'remove' || !protectedIds.has(change.id))
    onNodesChange(filteredChanges)
    setSelectedNodeIds((prev) => {
      const next = new Set(prev)
      filteredChanges.forEach((c) => {
        if (c.type === 'select') {
          if (c.selected) next.add(c.id)
          else next.delete(c.id)
        }
      })
      return [...next]
    })
  }, [nodes, onNodesChange])

  // Update node data
  const updateNodeData = useCallback((nodeId: string, patch: Partial<CanvasNodeData & { label: string }>) => {
    setNodes((prev) => prev.map((n) => {
      if (n.id !== nodeId) return n
      return { ...n, data: { ...n.data, ...patch } }
    }))
  }, [])

  const onConnect = useCallback((params: Connection) => {
    const sourceNode = nodes.find((node) => node.id === params.source)
    const targetNode = nodes.find((node) => node.id === params.target)
    const sourceHandle = params.sourceHandle ?? toUiHandleId(defaultHandleForNode(sourceNode, 'source'), 'source') ?? null
    const targetHandle = params.targetHandle ?? toUiHandleId(defaultHandleForNode(targetNode, 'target'), 'target') ?? null
    const sourcePort = portForHandle(sourceNode, 'source', sourceHandle)
    const targetPort = portForHandle(targetNode, 'target', targetHandle)

    if (!sourcePort || !targetPort) {
      toast.error(
        t('canvas.editor.invalidConnection', { defaultValue: 'Invalid connection' }),
        t('canvas.editor.missingPortConnection', { defaultValue: 'This node does not accept that connection.' })
      )
      return
    }

    if (!arePortTypesCompatible(sourcePort.type, targetPort.type)) {
      toast.error(
        t('canvas.editor.invalidConnection', { defaultValue: 'Invalid connection' }),
        `${portLabel(sourcePort)} -> ${portLabel(targetPort)}`
      )
      return
    }

    if (targetPort?.maxCount && targetNode) {
      const targetPortId = fromUiHandleId(targetHandle)
      const existingCount = edges.filter((edge) => (
        edge.target === targetNode.id
        && (fromUiHandleId(edge.targetHandle) ?? defaultHandleForNode(targetNode, 'target') ?? null) === targetPortId
      )).length
      if (existingCount >= targetPort.maxCount) {
        toast.error(
          t('canvas.editor.portLimitReached', { defaultValue: 'Input port limit reached' }),
          `${targetPort.label ?? targetPort.id}: ${targetPort.maxCount}`
        )
        return
      }
    }

    const nextEdge: Edge = {
      ...params,
      id: createCanvasEdgeId({ source: params.source, target: params.target, sourceHandle, targetHandle }),
      sourceHandle,
      targetHandle,
    }
    setEdges((eds) => eds.some((edge) => edgeConnectionKey(edge) === edgeConnectionKey(nextEdge))
      ? eds
      : addEdge(nextEdge, eds))
  }, [edges, nodes, setEdges, t])

  const onNodeClick = useCallback((_: React.MouseEvent, _node: Node) => {
    // Selection is handled by ReactFlow.
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

  const uploadDroppedFilesToCanvas = useCallback(async (files: File[], clientPosition: { x: number; y: number }) => {
    const supportedFiles = files.filter((file) => fileToCanvasResourceNodeType(file))
    if (supportedFiles.length === 0) {
      toast.error(t('canvas.editor.errors.unsupportedDropFiles', { defaultValue: 'No supported image, video, or text files found.' }))
      return
    }
    const basePosition = screenToFlowPosition(clientPosition)
    let addedCount = 0
    for (const [index, file] of supportedFiles.entries()) {
      try {
        const resource = await uploadCanvasResourceFile(file)
        const placed = addResourceNodeAtFlowPosition(resource, {
          x: basePosition.x + index * 28,
          y: basePosition.y + index * 28,
        })
        if (placed) addedCount += 1
      } catch (err: any) {
        toast.error(err?.response?.data?.error || err?.message || t('canvas.editor.errors.fileUploadFailed', { name: file.name, defaultValue: `Failed to upload ${file.name}` }))
      }
    }
    if (addedCount > 0) {
      toast.success(t('canvas.editor.uploadedFilesToCanvas', { count: addedCount, defaultValue: `Added ${addedCount} file(s) to canvas` }))
    }
  }, [addResourceNodeAtFlowPosition, screenToFlowPosition, t])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDropActive(false)
    const droppedFiles = Array.from(e.dataTransfer.files ?? [])
    if (droppedFiles.length > 0) {
      void uploadDroppedFilesToCanvas(droppedFiles, { x: e.clientX, y: e.clientY })
      return
    }
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
    const pluginPayload = e.dataTransfer.getData('application/canvas-plugin')
    if (pluginPayload) {
      try {
        const plugin = JSON.parse(pluginPayload) as ClientPluginManifest
        addPluginNodeAt(plugin, { x: e.clientX, y: e.clientY })
      } catch {
        // Ignore malformed drag data from outside the app.
      }
      return
    }
    const workflowCanvasPayload = e.dataTransfer.getData('application/canvas-workflow')
    if (workflowCanvasPayload) {
      const clientPosition = { x: e.clientX, y: e.clientY }
      try {
        const workflowCanvas = JSON.parse(workflowCanvasPayload) as Canvas
        void addWorkflowReferenceNodeAt(workflowCanvas, clientPosition)
      } catch {
        // Ignore malformed drag data from outside the app.
      }
      return
    }
    const type = e.dataTransfer.getData('application/canvas-node-type') as NodeType
    if (!type || !CANVAS_NODE_META[type]) return
    addNodeAt(type, { x: e.clientX, y: e.clientY })
  }, [addNodeAt, addPluginNodeAt, addResourceNodeAt, addWorkflowReferenceNodeAt, uploadDroppedFilesToCanvas])

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('application/canvas-node-type') || e.dataTransfer.types.includes('application/canvas-resource') || e.dataTransfer.types.includes('application/canvas-plugin') || e.dataTransfer.types.includes('application/canvas-workflow')) {
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
    if (node.type !== 'group') {
      groupDragSnapshotRef.current = null
      return
    }
    const memberIds = canvasGroupDescendantIds(nodes, node.id)
    groupDragSnapshotRef.current = {
      nodeId: node.id,
      position: { ...node.position },
      memberPositions: new Map(nodes
        .filter((candidate) => memberIds.has(candidate.id))
        .map((candidate) => [candidate.id, { ...candidate.position }])),
    }
  }, [nodes])

  const handleNodeDragStop = useCallback((event: React.MouseEvent, node: Node) => {
    setDraggingNodeId(null)
    onNodeDragStop(event, node)
  }, [onNodeDragStop])

  const handleViewportMove = useCallback((_: MouseEvent | TouchEvent | null, viewport: { x: number; y: number; zoom: number }) => {
    viewportZoomRef.current = viewport.zoom
    viewportPositionRef.current = { x: viewport.x, y: viewport.y }
    const nextGridZoomEligible = viewport.zoom >= CANVAS_GRID_MIN_ZOOM
    const nextOverviewMode = shouldUseCanvasOverviewMode(viewport.zoom, nodes.length)
    const nextMediaLightweightMode = shouldUseCanvasMediaLightweightMode({
      nodes,
      viewportX: viewport.x,
      viewportY: viewport.y,
      zoom: viewport.zoom,
      viewportWidth: canvasPaneRef.current?.clientWidth ?? window.innerWidth,
      viewportHeight: canvasPaneRef.current?.clientHeight ?? window.innerHeight,
    })
    setGridZoomEligible((current) => current === nextGridZoomEligible ? current : nextGridZoomEligible)
    setCanvasOverviewMode((current) => current === nextOverviewMode ? current : nextOverviewMode)
    setCanvasMediaLightweightMode((current) => current === nextMediaLightweightMode ? current : nextMediaLightweightMode)
  }, [nodes])

  useEffect(() => {
    const nextOverviewMode = shouldUseCanvasOverviewMode(viewportZoomRef.current, nodes.length)
    const nextMediaLightweightMode = shouldUseCanvasMediaLightweightMode({
      nodes,
      viewportX: viewportPositionRef.current.x,
      viewportY: viewportPositionRef.current.y,
      zoom: viewportZoomRef.current,
      viewportWidth: canvasPaneRef.current?.clientWidth ?? window.innerWidth,
      viewportHeight: canvasPaneRef.current?.clientHeight ?? window.innerHeight,
    })
    setCanvasOverviewMode((current) => current === nextOverviewMode ? current : nextOverviewMode)
    setCanvasMediaLightweightMode((current) => current === nextMediaLightweightMode ? current : nextMediaLightweightMode)
  }, [nodes])

  const nodesWithHandlers = useMemo(() => {
    const nodeById = new Map(nodes.map((node) => [node.id, node]))
    const pluginById = new Map(clientPlugins.map((plugin) => [plugin.id, plugin]))
    const incomingEdgesByTarget = new Map<string, Edge[]>()
    for (const edge of edges) {
      const incoming = incomingEdgesByTarget.get(edge.target)
      if (incoming) incoming.push(edge)
      else incomingEdgesByTarget.set(edge.target, [edge])
    }
    return nodes.map((n) => {
      const data = n.data as unknown as CanvasNodeData
      const referenceResources: RawResource[] = []
      const seenReferenceResourceIds = new Set<number>()
      for (const edge of incomingEdgesByTarget.get(n.id) ?? []) {
        const targetPort = portForHandle(n, 'target', edge.targetHandle)
        if (!targetPort || !['resource', 'image', 'video', 'audio'].includes(targetPort.type)) continue
        const sourceNode = nodeById.get(edge.source)
        const sourceData = sourceNode?.data as Partial<CanvasNodeData> | undefined
        const resource = sourceData?.resource ?? (sourceData?.resourceId ? canvasNodeResourceById.get(sourceData.resourceId) : undefined)
        if (!resource || seenReferenceResourceIds.has(resource.ID)) continue
        seenReferenceResourceIds.add(resource.ID)
        referenceResources.push(resource)
      }
      const plugin = n.type === 'plugin_card' && data.pluginId
        ? pluginById.get(data.pluginId)
        : undefined
      return {
        ...n,
        data: {
          ...n.data,
          canvasId: id,
          rfNodeId: n.id,
          availableResources: canvasNodeResources,
          referenceResources,
          canvasDebug,
          canvasOverviewMode,
          canvasMediaLightweightMode,
          ...(plugin?.inputSchema?.properties && { pluginInputProperties: plugin.inputSchema.properties }),
          onRun: n.type === 'plugin_card' ? () => runLocalPluginNode(n.id) : n.type !== 'group' ? () => runNode(n.id) : undefined,
          onUpdateContent: (content: string) => {
            const currentData = n.data as Partial<CanvasNodeData>
            if (n.type === 'text' && (currentData.resourceId || currentData.resource)) {
              updateNodeData(n.id, {
                textContent: content,
                resourceId: undefined,
                resource: undefined,
                source: 'manual',
                status: content.trim() ? 'done' : 'idle',
              })
              return
            }
            updateNodeData(n.id, { textContent: content })
          },
          onUpdatePrompt: (prompt: string) => updateNodeData(n.id, { prompt }),
          onUpdateOutputType: (outputType: string) => updateNodeData(n.id, { outputType } as any),
          onUpdateModelId: (modelId: string, modelDbId?: number) => updateNodeData(n.id, { modelId, modelDbId }),
          onUpdateAttachments: (ids: number[]) => updateNodeData(n.id, { inputResourceIds: ids }),
          onUpdateParams: (params: Record<string, unknown>) => updateNodeData(n.id, { params }),
          onUpdateParamName: (paramName: string) => updateNodeData(n.id, { paramName }),
          onUpdateParamOrder: (paramOrder: number) => updateNodeData(n.id, { paramOrder }),
          onUpdateParamType: (paramType: CanvasParamType) => updateNodeData(n.id, { paramType }),
          onApprove: () => handleApprove(n.id),
          onReject: () => handleReject(n.id),
        }
      }
    })
  }, [canvasDebug, canvasMediaLightweightMode, canvasNodeResourceById, canvasNodeResources, canvasOverviewMode, clientPlugins, edges, id, nodes, runLocalPluginNode, runNode, updateNodeData])

  const topLevelSelectedNodes = useMemo(
    () => topLevelSelectedCanvasNodes(nodes, nodes.filter((n) => n.selected && !isFinalOutputNode(n))),
    [nodes],
  )

  const topLevelSelectedGroups = useMemo(
    () => topLevelSelectedCanvasNodes(nodes, nodes.filter((n) => n.selected && n.type === 'group')),
    [nodes],
  )

  const selectedGroupBounds = useMemo(() => canvasGroupSelectionBounds(nodes, topLevelSelectedNodes), [nodes, topLevelSelectedNodes])

  const selectedUngroupBounds = useMemo(() => canvasGroupSelectionBounds(nodes, topLevelSelectedGroups, 0, 1), [nodes, topLevelSelectedGroups])

  const inputNodes = useMemo(() => nodes.filter((n) => n.type === 'input').sort(compareWorkflowIoNodes), [nodes])
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
  const activeRunStatusLabel = activeRun ? t(`canvas.runStatus.${activeRun.status}`) : undefined
  const workflowRunningCount = workflowRuns.filter((run) => run.status === 'running' || run.status === 'pending').length
  const selectedNodeMeta = selectedNode?.type ? CANVAS_NODE_META[selectedNode.type as NodeType] : undefined
  const savingCanvas = save.isPending || autoSaveState === 'saving' || renameCanvas.isPending
  const shouldBlockCanvasExit = hasUnsavedChanges || savingCanvas || runtimeStarting || runningCount > 0
  const showCanvasGrid = canvasDebug.grid && gridZoomEligible && !canvasOverviewMode
  const showCanvasMinimap = canvasDebug.minimap && !canvasOverviewMode && nodes.length <= CANVAS_MINIMAP_NODE_LIMIT
  const renderedNodes = useMemo(() => canvasDebug.nodes ? nodesWithHandlers : [], [canvasDebug.nodes, nodesWithHandlers])
  const visibleEdges = useMemo(() => {
    if (!canvasDebug.nodes || !canvasDebug.edges) return []
    return edges.map((edge) => ({
      ...edge,
      markerEnd: canvasOverviewMode ? undefined : (edge.markerEnd ?? { type: MarkerType.ArrowClosed, width: 14, height: 14 }),
      style: {
        ...edge.style,
        strokeWidth: canvasOverviewMode ? 1 : (edge.style?.strokeWidth ?? 1.6),
      },
    }))
  }, [canvasDebug.edges, canvasDebug.nodes, canvasOverviewMode, edges])
  const visiblePaletteSections = useMemo(() => SIDEBAR_NODE_CATEGORIES
    .map((category) => ({
      category,
      items: CANVAS_NODE_CATALOG.filter((item) => (
        item.category === category.id
        && !SIDEBAR_HIDDEN_NODE_TYPES.has(item.type)
        && isPaletteNodeTypeAvailable(item.type, canvasType)
      )),
    }))
    .filter((section) => section.items.length > 0), [canvasType])
  useEffect(() => {
    if (!canvasRenderDiagnosticsEnabled(canvasDebug)) return
    if (renderDiagnosticsTimerRef.current !== null) {
      window.clearTimeout(renderDiagnosticsTimerRef.current)
    }
    renderDiagnosticsTimerRef.current = window.setTimeout(() => {
      renderDiagnosticsTimerRef.current = null
      const root = canvasPaneRef.current
      const flow = root?.querySelector<HTMLElement>('.react-flow')
      const viewport = root?.querySelector<HTMLElement>('.react-flow__viewport')
      const domNodes = root?.querySelectorAll('.react-flow__node').length ?? 0
      const domEdges = root?.querySelectorAll('.react-flow__edge').length ?? 0
      const domVideos = root?.querySelectorAll('video').length ?? 0
      const domImages = root?.querySelectorAll('img').length ?? 0
      const domImageSample = Array.from(root?.querySelectorAll('img') ?? [])
        .slice(0, 12)
        .map((element) => compactCanvasMediaElement(element))
        .join('|') || 'none'
      const domVideoSample = Array.from(root?.querySelectorAll('video') ?? [])
        .slice(0, 6)
        .map((element) => compactCanvasMediaElement(element))
        .join('|') || 'none'
      const videoNodes = nodes.filter((node) => node.type === 'video' || (node.data as Partial<CanvasNodeData>)?.resource?.type === 'video')
      const imageNodes = nodes.filter((node) => node.type === 'image' || (node.data as Partial<CanvasNodeData>)?.resource?.type === 'image')
      const mediaWithResources = nodes
        .map((node) => ({ node, resource: (node.data as Partial<CanvasNodeData>)?.resource }))
        .filter((item) => item.resource?.type === 'image' || item.resource?.type === 'video')
      const rootRect = root?.getBoundingClientRect()
      const flowRect = flow?.getBoundingClientRect()
      const viewportTransform = viewport ? window.getComputedStyle(viewport).transform : 'none'
      const firstMedia = mediaWithResources.slice(0, 8).map((item) => `${item.node.id}:${compactCanvasResource(item.resource)}`).join('|') || 'none'

      console.info(
        [
          `[canvas:render] id=${id}`,
          `canvasType=${canvasType}`,
          `viewport=${window.innerWidth}x${window.innerHeight}`,
          `dpr=${window.devicePixelRatio.toFixed(2)}`,
          `pane=${rootRect ? compactCanvasRect(rootRect) : 'none'}`,
          `flow=${flowRect ? compactCanvasRect(flowRect) : 'none'}`,
          `nodes=${nodes.length}`,
          `edges=${edges.length}`,
          `renderedNodes=${renderedNodes.length}`,
          `renderedEdges=${visibleEdges.length}`,
          `domNodes=${domNodes}`,
          `domEdges=${domEdges}`,
          `images=${imageNodes.length}/${domImages}`,
          `videos=${videoNodes.length}/${domVideos}`,
          `resources=${canvasNodeResources.length}`,
          `selected=${selectedNodeIds.length}`,
          `running=${runningCount}`,
          `libraryCollapsed=${libraryCollapsed}`,
          `workflowCollapsed=${workflowPanelCollapsed}`,
          `zoom=${viewportZoomRef.current.toFixed(3)}`,
          `grid=${showCanvasGrid ? 'on' : 'off'}`,
          `minimap=${showCanvasMinimap ? 'on' : 'off'}`,
          `mediaLightweight=${canvasMediaLightweightMode ? 'on' : 'off'}`,
          `debug=${compactCanvasDebugOptions(canvasDebug)}`,
          `transform=${viewportTransform}`,
        ].join(' '),
      )
      console.info(`[canvas:render] media-sample id=${id} items=${firstMedia}`)
      console.info(`[canvas:render] image-dom-sample id=${id} items=${domImageSample}`)
      console.info(`[canvas:render] video-dom-sample id=${id} items=${domVideoSample}`)
    }, 250)

    return () => {
      if (renderDiagnosticsTimerRef.current !== null) {
        window.clearTimeout(renderDiagnosticsTimerRef.current)
        renderDiagnosticsTimerRef.current = null
      }
    }
  }, [canvasDebug, canvasId, canvasNodeResources.length, canvasType, edges.length, id, libraryCollapsed, nodes, renderedNodes.length, runningCount, selectedNodeIds.length, showCanvasGrid, showCanvasMinimap, visibleEdges.length, workflowPanelCollapsed])

  const requestCanvasExit = useCallback(async (leave: () => void) => {
    if (runningCount > 0 || runtimeStarting) {
      const ok = window.confirm(t('canvas.editor.leaveWhileRunningConfirm', {
        defaultValue: '画布仍在运行中。现在退出可能导致本次运行结果无法写回节点。确定要退出吗？',
      }))
      if (!ok) return
    }
    if (hasUnsavedChanges || savingCanvas) {
      const ok = window.confirm(t('canvas.editor.saveBeforeLeaveConfirm', {
        defaultValue: '画布有未保存改动。是否先保存再退出？',
      }))
      if (!ok) return
      try {
        setAutoSaveState('saving')
        await persistCanvasGraph(nodes, edges)
      } catch (err: any) {
        setAutoSaveState('error')
        toast.error(err?.response?.data?.error || err?.message || t('canvas.editor.autoSaveFailed', { defaultValue: '自动保存失败' }))
        return
      }
    }
    leave()
  }, [edges, hasUnsavedChanges, nodes, persistCanvasGraph, runningCount, runtimeStarting, savingCanvas, t])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!shouldBlockCanvasExit) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [shouldBlockCanvasExit])

  useEffect(() => {
    if (!useAppHeader) return
    setCanvasHeader({
      active: true,
      canvasName,
      canvasType,
      nodeCount: nodes.length,
      runningCount,
      doneCount,
      inputCount: workflowStats.inputs,
      processorCount: workflowStats.processors,
      outputCount: workflowStats.outputs,
	      activeRunLabel: canvasType === 'workflow' && activeRun && activeRunStatusLabel
	        ? t('canvas.editor.activeRun', { id: activeRun.id.slice(-6), status: activeRunStatusLabel })
	        : undefined,
      workflowRunningCount,
      saving: savingCanvas,
	      startingRun: runtimeStarting,
      libraryCollapsed,
      workflowPanelCollapsed,
      onNameChange: (name) => renameCanvas.mutate(name),
      onToggleLibrary: toggleLibraryCollapsed,
      onToggleWorkflowPanel: toggleWorkflowPanelCollapsed,
      onRun: handleRunWorkflow,
      onSave: () => save.mutate(),
    })
  }, [activeRun?.id, activeRunStatusLabel, canvasName, canvasType, doneCount, libraryCollapsed, nodes.length, renameCanvas, resetCanvasHeader, runtimeStarting, runningCount, save, savingCanvas, setCanvasHeader, t, toggleLibraryCollapsed, toggleWorkflowPanelCollapsed, useAppHeader, workflowPanelCollapsed, workflowRunningCount, workflowStats.inputs, workflowStats.outputs, workflowStats.processors])

  useEffect(() => {
    if (!useAppHeader) return
    return () => resetCanvasHeader()
  }, [resetCanvasHeader, useAppHeader])

  return (
    <CanvasEditorShell embedded={embedded}>
      {!useAppHeader && <CanvasEditorChrome embedded={embedded}>
        <CanvasEditorChromeContent>
          {embedded ? (
            <CanvasEditorTypeBadge>
              {canvasType === 'workflow' ? <Zap size={12} /> : <Lightbulb size={12} />}
              {t(`canvas.editor.canvasType.${canvasType}`)}
            </CanvasEditorTypeBadge>
          ) : (
            <CanvasEditorIconButton onClick={() => void requestCanvasExit(() => navigate(canvasBackPath(search)))}>
              <ArrowLeft size={16} />
            </CanvasEditorIconButton>
          )}

          <CanvasEditorIconButton
            onClick={toggleLibraryCollapsed}
            title={libraryCollapsed
              ? t('canvas.editor.expandNodeLibrary', { defaultValue: '展开节点库' })
              : t('canvas.editor.collapseNodeLibrary', { defaultValue: '收起节点库' })}
            aria-label={libraryCollapsed
              ? t('canvas.editor.expandNodeLibrary', { defaultValue: '展开节点库' })
              : t('canvas.editor.collapseNodeLibrary', { defaultValue: '收起节点库' })}
          >
            {libraryCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </CanvasEditorIconButton>

          <CanvasEditorTitleArea>
            <CanvasEditorTitleRow>
              {titleEditor.editing ? (
                <CanvasEditorNameInput
                  ref={titleEditor.inputRef}
                  value={titleEditor.draft}
                  onChange={(e) => titleEditor.setDraft(e.target.value)}
                  onBlur={titleEditor.commitEditing}
                  onKeyDown={titleEditor.handleInputKeyDown}
                  placeholder={t('canvas.editor.untitled')}
                  aria-label={t('canvas.editor.untitled')}
                  disabled={renameCanvas.isPending}
                />
              ) : (
                <CanvasEditorNameButton
                  onDoubleClick={titleEditor.startEditing}
                  onKeyDown={titleEditor.handleDisplayKeyDown}
                  title={t('canvas.editor.renameTitle', { defaultValue: '双击重命名' })}
                  aria-label={t('canvas.editor.renameTitle', { defaultValue: '双击重命名' })}
                >
                  {canvasName.trim() || t('canvas.editor.untitled')}
                </CanvasEditorNameButton>
              )}
              <CanvasEditorMetricBadge icon={<Workflow size={12} />}>
                {t('canvas.editor.nodesCount', { count: nodes.length })}
              </CanvasEditorMetricBadge>
              {runningCount > 0 && (
                <CanvasEditorRunningBadge icon={<Loader2 size={12} />} loading>
                  {t('canvas.editor.runningCount', { count: runningCount })}
                </CanvasEditorRunningBadge>
              )}
              {canvasType === 'workflow' && activeRun && activeRunStatusLabel && (
                <CanvasEditorStatusBadge
                  tone={activeRun.status === 'failed' ? 'danger' : 'neutral'}
                  icon={(activeRun.status === 'running' || activeRun.status === 'pending') ? <Loader2 size={12} /> : undefined}
                  loading={activeRun.status === 'running' || activeRun.status === 'pending'}
                >
                  {t('canvas.editor.activeRun', { id: activeRun.id.slice(-6), status: activeRunStatusLabel })}
                </CanvasEditorStatusBadge>
              )}
              {canvasType === 'workflow' && workflowRunningCount > 1 && (
                <CanvasEditorRunningBadge>
                  {t('canvas.editor.parallelRuns', { count: workflowRunningCount })}
                </CanvasEditorRunningBadge>
              )}
            </CanvasEditorTitleRow>
            <CanvasEditorStats
              items={[
                t('canvas.editor.stats.inputs', { count: workflowStats.inputs }),
                t('canvas.editor.stats.processors', { count: workflowStats.processors }),
                t('canvas.editor.stats.outputs', { count: workflowStats.outputs }),
                t('canvas.editor.stats.done', { count: doneCount }),
              ]}
            />
          </CanvasEditorTitleArea>

          {!embedded && (
            <CanvasEditorTypeBadge>
              {canvasType === 'workflow' ? <Zap size={12} /> : <Lightbulb size={12} />}
              {t(`canvas.editor.canvasType.${canvasType}`)}
            </CanvasEditorTypeBadge>
          )}

          <CanvasEditorIconButton
            onClick={handleRunWorkflow}
            disabled={runtimeStarting}
            title={runtimeStarting ? t('canvas.editor.starting') : t('canvas.editor.startRun')}
            aria-label={runtimeStarting ? t('canvas.editor.starting') : t('canvas.editor.startRun')}
          >
            {runtimeStarting ? <Loader2 size={14} className="canvas-editor-chrome__spin-icon" /> : <Play size={14} />}
          </CanvasEditorIconButton>

          <CanvasEditorIconButton
            onClick={() => save.mutate()}
            disabled={savingCanvas}
            title={savingCanvas
              ? t('common.saving')
              : hasUnsavedChanges
                ? t('canvas.editor.unsaved', { defaultValue: '未保存' })
                : t('common.save')}
            aria-label={savingCanvas
              ? t('common.saving')
              : hasUnsavedChanges
                ? t('canvas.editor.unsaved', { defaultValue: '未保存' })
                : t('common.save')}
          >
            {savingCanvas ? <Loader2 size={14} className="canvas-editor-chrome__spin-icon" /> : <Save size={14} />}
          </CanvasEditorIconButton>

          {embedded && onClose && (
            <CanvasEditorIconButton onClick={() => void requestCanvasExit(onClose)}>
              <PanelRightClose size={14} />
            </CanvasEditorIconButton>
          )}
        </CanvasEditorChromeContent>
      </CanvasEditorChrome>}

      <CanvasEditorMain>
        <CanvasPalettePanel collapsed={libraryCollapsed}>
          <CanvasPaletteInner>
            {!libraryCollapsed && (
              <CanvasPaletteHeader icon={<Layers3 size={14} />}>
                {t('canvas.editor.nodeLibrary')}
              </CanvasPaletteHeader>
            )}

            {libraryCollapsed ? (
              <CanvasPaletteCollapsedBody>
                {visiblePaletteSections.map(({ category, items }, index) => {
                  return (
                    <CanvasPaletteCollapsedGroup key={category.id} separated={index > 0}>
                      <CanvasPaletteCollapsedItems>
                        {items.map((item) => {
                          const Icon = item.icon
                          return (
                            <CanvasPaletteCollapsedItemButton
                              key={item.type}
                              type="button"
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData('application/canvas-node-type', item.type)
                                e.dataTransfer.effectAllowed = 'copy'
                              }}
                              onClick={() => addNodeAt(item.type)}
                              title={t(item.labelKey)}
                              aria-label={t(item.labelKey)}
                            >
                              <Icon size={14} />
                            </CanvasPaletteCollapsedItemButton>
                          )
                        })}
                      </CanvasPaletteCollapsedItems>
                    </CanvasPaletteCollapsedGroup>
                  )
                })}
                {clientPlugins.length > 0 && (
                  <CanvasPaletteCollapsedGroup separated>
                    <CanvasPaletteCollapsedItems>
                      {clientPlugins.map((plugin) => (
                        <CanvasPaletteCollapsedItemButton
                          key={plugin.id}
                          type="button"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('application/canvas-plugin', JSON.stringify(plugin))
                            e.dataTransfer.effectAllowed = 'copy'
                          }}
                          onClick={() => addPluginNodeAt(plugin)}
                          title={plugin.name}
                          aria-label={plugin.name}
                        >
                          <Puzzle size={14} />
                        </CanvasPaletteCollapsedItemButton>
                      ))}
                    </CanvasPaletteCollapsedItems>
                  </CanvasPaletteCollapsedGroup>
                )}
              </CanvasPaletteCollapsedBody>
            ) : (
              <CanvasPaletteExpandedBody>
                <CanvasPaletteHint icon={<Search size={12} />}>
                  {t('canvas.editor.nodeLibraryHint')}
                </CanvasPaletteHint>
                <CanvasPaletteSections>
                  {visiblePaletteSections.map(({ category, items }) => {
                    return (
                      <CanvasPaletteSection key={category.id}>
                        <CanvasPaletteSectionHeader>
                          <CanvasPaletteSectionTitle>{t(category.titleKey)}</CanvasPaletteSectionTitle>
                          <CanvasPaletteSectionDescription>{t(category.descriptionKey)}</CanvasPaletteSectionDescription>
                        </CanvasPaletteSectionHeader>
                        <CanvasPaletteItemGrid>
                          {items.map((item) => {
                            const Icon = item.icon
                            return (
                              <CanvasPaletteItemButton
                                key={item.type}
                                type="button"
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData('application/canvas-node-type', item.type)
                                  e.dataTransfer.effectAllowed = 'copy'
                                }}
                                onClick={() => addNodeAt(item.type)}
                                icon={<Icon size={14} />}
                                title={t(item.labelKey)}
                                description={t(item.descriptionKey)}
                                dragHandle={<GripVertical size={14} />}
                              />
                            )
                          })}
                        </CanvasPaletteItemGrid>
                      </CanvasPaletteSection>
                    )
                  })}
                  <CanvasPaletteSection>
                    <CanvasPaletteSectionHeader>
                      <CanvasPaletteSectionTitle>{t('canvas.catalog.categories.plugins.title')}</CanvasPaletteSectionTitle>
                      <CanvasPaletteSectionDescription>{t('canvas.catalog.categories.plugins.description')}</CanvasPaletteSectionDescription>
                    </CanvasPaletteSectionHeader>
                    <CanvasPaletteItemGrid>
                      {clientPlugins.length === 0 && (
                        <CanvasPaletteEmpty>
                          {t('canvas.pluginCard.noPlugins')}
                        </CanvasPaletteEmpty>
                      )}
                      {clientPlugins.map((plugin) => (
                        <CanvasPaletteItemButton
                          key={plugin.id}
                          type="button"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('application/canvas-plugin', JSON.stringify(plugin))
                            e.dataTransfer.effectAllowed = 'copy'
                          }}
                          onClick={() => addPluginNodeAt(plugin)}
                          icon={<Puzzle size={14} />}
                          title={plugin.name}
                          description={plugin.description || t('canvas.pluginCard.localRuntime')}
                          dragHandle={<GripVertical size={14} />}
                        />
                      ))}
                    </CanvasPaletteItemGrid>
                  </CanvasPaletteSection>
                </CanvasPaletteSections>
              </CanvasPaletteExpandedBody>
            )}
          </CanvasPaletteInner>
        </CanvasPalettePanel>

        <CanvasEditorContent>
          <CanvasViewportPane
            ref={canvasPaneRef}
            dropActive={dropActive}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
          >
            <ReactFlow
              className={cn(
                canvasFlowClassName,
                (!canvasDebug.shadows || canvasOverviewMode) && 'canvas-flow--debug-no-shadows',
                canvasOverviewMode && 'canvas-flow--overview',
              )}
              nodes={renderedNodes}
              edges={visibleEdges}
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
              onMove={handleViewportMove}
              nodeTypes={nodeTypes}
              defaultViewport={{ x: 0, y: 0, zoom: 1 }}
              minZoom={0.1}
              maxZoom={4}
              deleteKeyCode={['Delete', 'Backspace']}
              selectionOnDrag={true}
              panOnDrag={[1, 2]}
              panOnScroll={true}
              panOnScrollMode={PanOnScrollMode.Free}
              selectionMode={SelectionMode.Full}
              connectionMode={ConnectionMode.Loose}
              connectionRadius={40}
              onlyRenderVisibleElements={canvasDebug.visibleOnly}
              defaultEdgeOptions={{
                type: 'default',
                markerEnd: canvasOverviewMode ? undefined : { type: MarkerType.ArrowClosed, width: 14, height: 14 },
                style: { strokeWidth: canvasOverviewMode ? 1 : 1.6 },
              }}
            >
              {selectedGroupBounds && (
                <ViewportPortal>
                  <CanvasSelectionFrame
                    style={{
                      transform: `translate(${selectedGroupBounds.x}px, ${selectedGroupBounds.y}px)`,
                      width: selectedGroupBounds.width,
                      height: selectedGroupBounds.height,
                    }}
                  >
                    <CanvasViewportSelectionActionButton
                      type="button"
                      onClick={createGroupFromSelection}
                    >
                      <Layers3 size={13} />
                      {t('canvas.contextMenu.groupSelected', { count: selectedGroupBounds.count })}
                    </CanvasViewportSelectionActionButton>
                  </CanvasSelectionFrame>
                </ViewportPortal>
              )}
              {selectedUngroupBounds && (
                <ViewportPortal>
                  <CanvasViewportBoundsLayer
                    x={selectedUngroupBounds.x}
                    y={selectedUngroupBounds.y}
                    width={selectedUngroupBounds.width}
                    height={selectedUngroupBounds.height}
                  >
                    <CanvasViewportActionButton
                      type="button"
                      onClick={ungroupSelectedGroups}
                    >
                      <Ungroup size={13} />
                      {t('canvas.contextMenu.ungroupSelected', { count: selectedUngroupBounds.count })}
                    </CanvasViewportActionButton>
                  </CanvasViewportBoundsLayer>
                </ViewportPortal>
              )}
              {showCanvasGrid && <Background gap={24} size={1} color={canvasFlowBackgroundColor} />}
              {canvasDebug.controls && <Controls position="bottom-left" />}
              {showCanvasMinimap && <MiniMap zoomable pannable position="bottom-right" nodeStrokeWidth={3} />}
            </ReactFlow>

            {nodes.length === 0 && (
              <CanvasViewportEmptyOverlay>
                <CanvasViewportEmptyState
                  icon={Sparkles}
                  title={t('canvas.editor.emptyTitle')}
                  detail={t('canvas.editor.emptyDescription')}
                />
              </CanvasViewportEmptyOverlay>
            )}

            {dropActive && (
              <CanvasDropOverlay>
                {t('canvas.editor.dropToPlace')}
              </CanvasDropOverlay>
            )}

            <CanvasViewportStatusOverlay icon={<MousePointer2 size={14} />}>
              {draggingNodeId
                ? t('canvas.editor.status.dragging')
                : selectedNode
                  ? t('canvas.editor.status.selected', { label: selectedNodeData?.label || (selectedNodeMeta ? t(selectedNodeMeta.labelKey) : selectedNode.type) })
                  : t('canvas.editor.status.idle')}
            </CanvasViewportStatusOverlay>

          </CanvasViewportPane>

          {canvasDebug.shelf && (
            <WorkflowSidePanel
              projectId={canvas?.project_id}
              dependencyBindings={canvasDependencyBindings}
              disableResourcePreviews={!canvasDebug.media}
              activeTab={workflowPanelTab}
              collapsed={workflowPanelCollapsed}
              runs={workflowRuns}
              total={workflowRunTotal}
              page={runHistoryPage}
              pageCount={workflowRunPageCount}
              statusFilter={runStatusFilter}
              activeRunId={activeRunId}
	              isLoading={false}
              onTabChange={setWorkflowPanelTab}
              onCollapsedChange={setWorkflowPanelCollapsed}
              onStatusFilterChange={setRunStatusFilter}
              onPageChange={setRunHistoryPage}
              onSelectRun={setActiveRunId}
              currentCanvasId={Number(id)}
              onAddWorkflowReference={(workflowCanvas) => {
                const fallbackRect = canvasPaneRef.current?.getBoundingClientRect()
                const screenPosition = fallbackRect
                  ? { x: fallbackRect.left + fallbackRect.width / 2, y: fallbackRect.top + fallbackRect.height / 2 }
                  : { x: window.innerWidth / 2, y: window.innerHeight / 2 }
                void addWorkflowReferenceNodeAt(workflowCanvas, screenPosition)
              }}
            />
          )}
        </CanvasEditorContent>
      </CanvasEditorMain>

      {resultDialogRun && (
        <WorkflowRunResultsDialog
          run={resultDialogRun}
          nodes={nodes}
          removingResourceId={removingRunResultResourceId}
          onRemoveResource={(resourceId) => removeRunResultResource.mutateAsync(resourceId).then(() => undefined)}
          onClose={() => setRunResultDialogRunId(null)}
        />
      )}

      {/* Context menu */}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          canvasType={canvasType}
          onAdd={addNode}
          onClose={() => setMenu(null)}
          selectedCount={topLevelSelectedNodes.length}
          selectedGroupCount={topLevelSelectedGroups.length}
          onGroupSelected={createGroupFromSelection}
          onUngroupSelected={ungroupSelectedGroups}
          onDeleteSelected={deleteSelectedNodes}
          hasSelection={nodes.some(n => n.selected)}
        />
      )}

      {/* Workflow input dialog */}
      {runDialogOpen && (
        <CanvasRuntimeInputDialogShell>
          <CanvasRuntimeInputDialogHeader
            title={t('canvas.workflowInputTitle')}
            description={t('canvas.editor.workflowInputDescription')}
          />
          <CanvasRuntimeInputDialogBody>
            {inputNodes.map((n, index) => {
              const port = portForWorkflowInputNode(n)
              const label = port.labelKey ? t(port.labelKey, { defaultValue: port.label ?? port.id }) : (port.label ?? port.id)
              const value = inputValues[n.id] ?? ''
              return (
                <CanvasRuntimeInputDialogField key={n.id}>
                  <CanvasRuntimeInputDialogFieldLabel label={label} portType={port.type} />
                  {port.type === 'boolean' ? (
                    <CanvasRuntimeInputDialogCheckbox
                      checked={value === 'true'}
                      onCheckedChange={(checked) => setInputValues((prev) => ({ ...prev, [n.id]: checked ? 'true' : 'false' }))}
                      inputProps={{ autoFocus: index === 0 }}
                    >
                      {t('canvas.editor.booleanEnabled', { defaultValue: 'Enabled' })}
                    </CanvasRuntimeInputDialogCheckbox>
                  ) : port.type === 'number' ? (
                    <CanvasRuntimeInputDialogInput
                      type="number"
                      value={value}
                      onChange={(event) => setInputValues((prev) => ({ ...prev, [n.id]: event.target.value }))}
                      autoFocus={index === 0}
                    />
                  ) : port.type === 'json' ? (
                    <CanvasRuntimeInputDialogTextarea
                      rows={5}
                      code
                      value={value}
                      onChange={(event) => setInputValues((prev) => ({ ...prev, [n.id]: event.target.value }))}
                      autoFocus={index === 0}
                    />
                  ) : port.type === 'image' || port.type === 'video' || port.type === 'resource' ? (
                    <CanvasRuntimeInputDialogInput
                      type="number"
                      min={1}
                      step={1}
                      placeholder={t('canvas.editor.resourceIdPlaceholder', { defaultValue: 'Resource ID' })}
                      value={value}
                      onChange={(event) => setInputValues((prev) => ({ ...prev, [n.id]: event.target.value }))}
                      autoFocus={index === 0}
                    />
                  ) : (
                    <CanvasRuntimeInputDialogTextarea
                      rows={3}
                      placeholder={t('canvas.inputContentPlaceholder')}
                      value={value}
                      onChange={(event) => setInputValues((prev) => ({ ...prev, [n.id]: event.target.value }))}
                      autoFocus={index === 0}
                    />
                  )}
                </CanvasRuntimeInputDialogField>
              )
            })}
          </CanvasRuntimeInputDialogBody>
          <CanvasRuntimeInputDialogActions>
            <CanvasRuntimeInputDialogActionButton onClick={handleConfirmRun} stretch>
              {t('canvas.startRun')}
            </CanvasRuntimeInputDialogActionButton>
            <CanvasRuntimeInputDialogActionButton
              variant="outline"
              onClick={() => setRunDialogOpen(false)}
            >
              {t('common.cancel')}
            </CanvasRuntimeInputDialogActionButton>
          </CanvasRuntimeInputDialogActions>
        </CanvasRuntimeInputDialogShell>
      )}

      {/* Single-node runtime input dialog */}
      {nodeRunDialog && (
        <CanvasRuntimeInputDialogShell size="node">
          <CanvasRuntimeInputDialogHeader
            title={t('canvas.editor.nodeRuntimeInputTitle', { defaultValue: 'Runtime inputs' })}
            description={t('canvas.editor.nodeRuntimeInputDescription', { defaultValue: 'Provide values for unconnected input ports before running this node.' })}
          />
          <CanvasRuntimeInputDialogBody>
            {nodeRunDialog.ports.map((port, index) => {
              const label = port.labelKey ? t(port.labelKey, { defaultValue: port.label ?? port.id }) : (port.label ?? port.id)
              const value = nodeRunValues[port.id] ?? ''
              return (
                <CanvasRuntimeInputDialogField key={port.id}>
                  <CanvasRuntimeInputDialogFieldLabel label={label} portType={port.type} required={port.required} />
                  {port.type === 'boolean' ? (
                    <CanvasRuntimeInputDialogCheckbox
                      checked={value === 'true'}
                      onCheckedChange={(checked) => setNodeRunValues((prev) => ({ ...prev, [port.id]: checked ? 'true' : 'false' }))}
                      inputProps={{ autoFocus: index === 0 }}
                    >
                      {t('canvas.editor.booleanEnabled', { defaultValue: 'Enabled' })}
                    </CanvasRuntimeInputDialogCheckbox>
                  ) : port.type === 'number' ? (
                    <CanvasRuntimeInputDialogInput
                      type="number"
                      value={value}
                      onChange={(event) => setNodeRunValues((prev) => ({ ...prev, [port.id]: event.target.value }))}
                      autoFocus={index === 0}
                    />
                  ) : port.type === 'json' ? (
                    <CanvasRuntimeInputDialogTextarea
                      rows={5}
                      code
                      value={value}
                      onChange={(event) => setNodeRunValues((prev) => ({ ...prev, [port.id]: event.target.value }))}
                      autoFocus={index === 0}
                    />
                  ) : port.type === 'image' || port.type === 'video' || port.type === 'resource' ? (
                    <CanvasRuntimeInputDialogInput
                      type="number"
                      min={1}
                      step={1}
                      placeholder={t('canvas.editor.resourceIdPlaceholder', { defaultValue: 'Resource ID' })}
                      value={value}
                      onChange={(event) => setNodeRunValues((prev) => ({ ...prev, [port.id]: event.target.value }))}
                      autoFocus={index === 0}
                    />
                  ) : (
                    <CanvasRuntimeInputDialogTextarea
                      rows={3}
                      value={value}
                      onChange={(event) => setNodeRunValues((prev) => ({ ...prev, [port.id]: event.target.value }))}
                      autoFocus={index === 0}
                    />
                  )}
                </CanvasRuntimeInputDialogField>
              )
            })}
          </CanvasRuntimeInputDialogBody>
          <CanvasRuntimeInputDialogActions>
            <CanvasRuntimeInputDialogActionButton onClick={handleConfirmNodeRun} stretch>
              {t('shared.generation.runNode')}
            </CanvasRuntimeInputDialogActionButton>
            <CanvasRuntimeInputDialogActionButton
              variant="outline"
              onClick={() => {
                setNodeRunDialog(null)
                setNodeRunValues({})
              }}
            >
              {t('common.cancel')}
            </CanvasRuntimeInputDialogActionButton>
          </CanvasRuntimeInputDialogActions>
        </CanvasRuntimeInputDialogShell>
      )}
    </CanvasEditorShell>
  )
}

export default function CanvasEditorPage({ embeddedInShell = false }: { embeddedInShell?: boolean }) {
  const { id } = useParams<{ id: string }>()
  if (!id) return null
  return (
    <ReactFlowProvider>
      <CanvasWorkspace canvasId={id} embedded={embeddedInShell} useAppHeader={embeddedInShell} />
    </ReactFlowProvider>
  )
}
