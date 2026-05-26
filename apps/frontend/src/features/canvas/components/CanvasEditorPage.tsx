import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
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
  ViewportPortal,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { api } from '@/shared/infrastructure/api'
import type { Canvas, CanvasNodeData, CanvasPortDef, CanvasPortValue, CanvasRunStatus, CanvasType, NodeType, RawResource } from '@/types'
import {
	TextNode, ImageNode, VideoNode, ToolNode,
	InputNode, OutputNode, ResourceSinkNode, ApprovalNode, TextGenNode, AIGenNode, GroupNode, PluginCardNode,
} from '@/features/canvas/ui/CanvasNodes'
import { ContextMenu } from '@/features/canvas/ui/ContextMenu'
import { useCanvasWorkflowReferencePorts } from '@/features/canvas/integrations/workflowReferences'
import {
  resourceToNodeType,
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
  canvasGroupSelectionBounds,
  canvasNodeAbsolutePosition,
  canvasNodeDimensions,
  commonParentId,
  topLevelSelectedCanvasNodes,
} from '@/features/canvas/domain/layout'
import { isFinalOutputNode } from '@/features/canvas/domain/graph'
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
  CanvasEditorActionButton,
  CanvasEditorChrome,
  CanvasEditorChromeContent,
  CanvasEditorContent,
  CanvasEditorIconButton,
  CanvasEditorMain,
  CanvasEditorMetricBadge,
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
const SIDEBAR_HIDDEN_NODE_TYPES = new Set<NodeType>(['approval'])

interface CanvasWorkspaceProps {
  canvasId: number | string
  embedded?: boolean
  useAppHeader?: boolean
  onClose?: () => void
}

export function CanvasWorkspace({ canvasId, embedded = false, useAppHeader = false, onClose }: CanvasWorkspaceProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { search } = useLocation()
  const { screenToFlowPosition, fitView } = useReactFlow()
  const id = String(canvasId)

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

  // Workflow input dialog
  const [runDialogOpen, setRunDialogOpen] = useState(false)
  const [inputValues, setInputValues] = useState<Record<string, string>>({})
  const [nodeRunDialog, setNodeRunDialog] = useState<{ nodeId: string; ports: CanvasPortDef[] } | null>(null)
  const [nodeRunValues, setNodeRunValues] = useState<Record<string, string>>({})
	  const [activeRunId, setActiveRunId] = useState<string | null>(null)
	  const [runHistoryPage, setRunHistoryPage] = useState(1)
	  const [runStatusFilter, setRunStatusFilter] = useState<'all' | CanvasRunStatus>('all')
	  const [workflowPanelTab, setWorkflowPanelTab] = useState<'resources' | 'history'>('resources')
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
  const {
    hasUnsavedChanges,
    autoSaveState,
    setAutoSaveState,
    persistCanvasGraph,
    save,
  } = useCanvasDocument({
    canvasId: id,
    canvas,
    canvasName,
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
    const ports = runtimeInputPortsForNode(node, edges)
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
    const fallbackRect = canvasPaneRef.current?.getBoundingClientRect()
    const screenPosition = clientPosition ?? (
      fallbackRect
        ? { x: fallbackRect.left + fallbackRect.width / 2, y: fallbackRect.top + fallbackRect.height / 2 }
        : { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    )
    const position = screenToFlowPosition(screenPosition)
    const newNode = createPaletteCanvasNode({ type, position, t })
    setNodes((prev) => [...prev, newNode])
  }, [screenToFlowPosition, t])

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

  // Delete selected nodes and their connected edges (also removes children of deleted groups)
	  const deleteSelectedNodes = useCallback(() => {
	    const directSelected = new Set(nodes.filter(n => n.selected && !isFinalOutputNode(n)).map(n => n.id))
	    if (directSelected.size === 0) return
	    const toDelete = new Set(directSelected)
	    let changed = true
	    while (changed) {
	      changed = false
	      nodes.forEach((node) => {
	        if (!node.parentId || !toDelete.has(node.parentId) || toDelete.has(node.id)) return
	        toDelete.add(node.id)
	        changed = true
	      })
	    }
	    setNodes(prev => prev.filter(n => !toDelete.has(n.id)))
	    setEdges(prev => prev.filter(e => !toDelete.has(e.source) && !toDelete.has(e.target)))
	    setSelectedNodeIds([])
  }, [nodes, setNodes, setEdges])

  // Group selected nodes into a new group node
  const createGroupFromSelection = useCallback(() => {
    const selected = topLevelSelectedCanvasNodes(nodes, nodes.filter((n) => n.selected && !isFinalOutputNode(n)))
    const bounds = canvasGroupSelectionBounds(nodes, selected)
    if (!bounds) return
    const groupId = createCanvasNodeId()
    const nodeById = new Map(nodes.map((node) => [node.id, node]))
    const parentId = commonParentId(selected)
    const parent = parentId ? nodeById.get(parentId) : undefined
    const parentPosition = parent ? canvasNodeAbsolutePosition(parent, nodeById) : { x: 0, y: 0 }
    const groupNode: Node = {
      id: groupId,
      type: 'group',
      position: { x: bounds.x - parentPosition.x, y: bounds.y - parentPosition.y },
      style: { width: bounds.width, height: bounds.height },
      zIndex: -1,
      data: { source: 'manual', label: t('canvas.nodeLabels.group'), isGroup: true },
      selected: true,
      ...(parentId ? { parentId } : {}),
    }
    const selectedIds = new Set(selected.map((node) => node.id))
    setNodes((prev) => {
      const nextNodes = prev.map((n) => {
        if (!selectedIds.has(n.id)) return n
        const absolutePosition = bounds.absolutePositionByNodeId.get(n.id) ?? n.position
        // Convert to relative position, no extent:'parent' so nodes can be dragged out
        return {
          ...n,
          parentId: groupId,
          position: { x: absolutePosition.x - bounds.x, y: absolutePosition.y - bounds.y },
          selected: false,
        }
      })
      const insertIndex = parentId
        ? Math.max(0, nextNodes.findIndex((node) => node.id === parentId) + 1)
        : 0
      return [
        ...nextNodes.slice(0, insertIndex),
        groupNode,
        ...nextNodes.slice(insertIndex),
      ]
    })
    setSelectedNodeIds([groupId])
  }, [nodes, t])

  const ungroupSelectedGroups = useCallback(() => {
    const selectedGroups = topLevelSelectedCanvasNodes(nodes, nodes.filter((node) => node.selected && node.type === 'group'))
    if (selectedGroups.length === 0) return
    const selectedGroupIds = new Set(selectedGroups.map((node) => node.id))
    const groupById = new Map(selectedGroups.map((node) => [node.id, node]))
    const promotedNodeIds = nodes
      .filter((node) => node.parentId && selectedGroupIds.has(node.parentId))
      .map((node) => node.id)
    setNodes((prev) => prev.flatMap((node) => {
      if (selectedGroupIds.has(node.id)) return []
      if (!node.parentId || !selectedGroupIds.has(node.parentId)) return node
      const group = groupById.get(node.parentId)
      if (!group) return node
      return [{
        ...node,
        parentId: group.parentId,
        position: {
          x: group.position.x + node.position.x,
          y: group.position.y + node.position.y,
        },
        selected: true,
      }]
    }))
    setSelectedNodeIds(promotedNodeIds)
  }, [nodes, setNodes])

  // Drag node out of group → detach it
  const onNodeDragStop = useCallback((_: React.MouseEvent, draggedNode: Node) => {
    if (!draggedNode.parentId) return
    const parent = nodes.find(n => n.id === draggedNode.parentId)
    if (!parent) return
    const gw = (parent.style as any)?.width ?? 320
    const gh = (parent.style as any)?.height ?? 240
    const { x: nx, y: ny } = draggedNode.position
    const { width: nw, height: nh } = canvasNodeDimensions(draggedNode)
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
  }, [addNodeAt, addPluginNodeAt, addResourceNodeAt, addWorkflowReferenceNodeAt])

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/canvas-node-type') || e.dataTransfer.types.includes('application/canvas-resource') || e.dataTransfer.types.includes('application/canvas-plugin') || e.dataTransfer.types.includes('application/canvas-workflow')) {
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

  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const nodesWithHandlers = nodes.map((n) => {
    const data = n.data as unknown as CanvasNodeData
    const referenceResources: RawResource[] = []
    const seenReferenceResourceIds = new Set<number>()
    edges.forEach((edge) => {
      if (edge.target !== n.id) return
      const targetPort = portForHandle(n, 'target', edge.targetHandle)
      if (!targetPort || !['resource', 'image', 'video'].includes(targetPort.type)) return
      const sourceNode = nodeById.get(edge.source)
      const sourceData = sourceNode?.data as Partial<CanvasNodeData> | undefined
      const resource = sourceData?.resource ?? (sourceData?.resourceId ? canvasNodeResourceById.get(sourceData.resourceId) : undefined)
      if (!resource || seenReferenceResourceIds.has(resource.ID)) return
      seenReferenceResourceIds.add(resource.ID)
      referenceResources.push(resource)
    })
    const plugin = n.type === 'plugin_card' && data.pluginId
      ? clientPlugins.find((item) => item.id === data.pluginId)
      : undefined
    return {
      ...n,
      data: {
        ...n.data,
        canvasId: id,
        rfNodeId: n.id,
        availableResources: canvasNodeResources,
        referenceResources,
        ...(plugin?.inputSchema?.properties && { pluginInputProperties: plugin.inputSchema.properties }),
        onRun: n.type === 'plugin_card' ? () => runLocalPluginNode(n.id) : n.type !== 'group' ? () => runNode(n.id) : undefined,
        onUpdateContent: (content: string) => updateNodeData(n.id, { textContent: content }),
        onUpdatePrompt: (prompt: string) => updateNodeData(n.id, { prompt }),
        onUpdateOutputType: (outputType: string) => updateNodeData(n.id, { outputType } as any),
        onUpdateModelId: (modelId: string, modelDbId?: number) => updateNodeData(n.id, { modelId, modelDbId }),
        onUpdateAttachments: (ids: number[]) => updateNodeData(n.id, { inputResourceIds: ids }),
        onUpdateParams: (params: Record<string, unknown>) => updateNodeData(n.id, { params }),
        onApprove: () => handleApprove(n.id),
        onReject: () => handleReject(n.id),
      }
    }
  })

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
  const activeRunStatusLabel = activeRun ? t(`canvas.runStatus.${activeRun.status}`) : undefined
  const workflowRunningCount = workflowRuns.filter((run) => run.status === 'running' || run.status === 'pending').length
  const selectedNodeMeta = selectedNode?.type ? CANVAS_NODE_META[selectedNode.type as NodeType] : undefined
  const savingCanvas = save.isPending || autoSaveState === 'saving'
  const shouldBlockCanvasExit = hasUnsavedChanges || savingCanvas || runtimeStarting || runningCount > 0

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
      onNameChange: setCanvasName,
      onToggleLibrary: toggleLibraryCollapsed,
      onRun: handleRunWorkflow,
      onSave: () => save.mutate(),
    })
  }, [activeRun?.id, activeRunStatusLabel, canvasName, canvasType, doneCount, libraryCollapsed, nodes.length, resetCanvasHeader, runtimeStarting, runningCount, save, savingCanvas, setCanvasHeader, t, toggleLibraryCollapsed, useAppHeader, workflowRunningCount, workflowStats.inputs, workflowStats.outputs, workflowStats.processors])

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
              <CanvasEditorNameInput
                value={canvasName}
                onChange={(e) => setCanvasName(e.target.value)}
                placeholder={t('canvas.editor.untitled')}
              />
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

          <CanvasEditorActionButton onClick={handleRunWorkflow} disabled={runtimeStarting}>
            <Play size={12} /> {runtimeStarting ? t('canvas.editor.starting') : t('canvas.editor.startRun')}
          </CanvasEditorActionButton>

          <CanvasEditorActionButton onClick={() => save.mutate()} disabled={savingCanvas} loading={savingCanvas} variant="outline">
            {!savingCanvas ? <Save size={12} /> : null}
            {savingCanvas
              ? t('common.saving')
              : hasUnsavedChanges
                ? t('canvas.editor.unsaved', { defaultValue: '未保存' })
                : t('common.save')}
          </CanvasEditorActionButton>

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
                {SIDEBAR_NODE_CATEGORIES.map((category, index) => {
                  const items = CANVAS_NODE_CATALOG.filter((item) => item.category === category.id && !SIDEBAR_HIDDEN_NODE_TYPES.has(item.type))
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
                  {SIDEBAR_NODE_CATEGORIES.map((category) => {
                    const items = CANVAS_NODE_CATALOG.filter((item) => item.category === category.id && !SIDEBAR_HIDDEN_NODE_TYPES.has(item.type))
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
              className={canvasFlowClassName}
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
              selectionMode={SelectionMode.Full}
              connectionMode={ConnectionMode.Loose}
              connectionRadius={40}
              defaultEdgeOptions={{
                type: 'default',
                markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
                style: { strokeWidth: 1.6 },
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
              <Background gap={18} size={1} color={canvasFlowBackgroundColor} />
              <Controls position="bottom-left" />
              <MiniMap zoomable pannable position="bottom-right" nodeStrokeWidth={3} />
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

          <WorkflowSidePanel
            projectId={canvas?.project_id}
            dependencyBindings={canvasDependencyBindings}
            activeTab={workflowPanelTab}
            runs={workflowRuns}
            total={workflowRunTotal}
            page={runHistoryPage}
            pageCount={workflowRunPageCount}
            statusFilter={runStatusFilter}
            activeRunId={activeRunId}
	            isLoading={false}
            onTabChange={setWorkflowPanelTab}
            onStatusFilterChange={setRunStatusFilter}
            onPageChange={setRunHistoryPage}
            onSelectRun={setActiveRunId}
          />
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
