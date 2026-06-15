import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  ReactFlowProvider,
  useReactFlow,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { api } from '@/shared/infrastructure/api'
import { canvasKeys } from '@/features/canvas/application/canvasQueryKeys'
import {
  canvasListChangedResult,
  commitCanvasRenameMutation,
  invalidateCanvasMutationResult,
  prepareCanvasRenameMutation,
  restoreCanvasRenameMutation,
} from '@/features/canvas/application/canvasMutationInvalidation'
import type { Canvas, CanvasNodeData, CanvasParamType, CanvasType, NodeType, RawResource } from '@/types'
import { useCanvasWorkflowReferencePorts } from '@/features/canvas/integrations/workflowReferences'
import {
  fileToCanvasResourceNodeType,
  resourceToNodeType,
  uploadCanvasResourceFile,
  useCanvasResourceIntegration,
} from '@/features/canvas/integrations/resources'
import { toast } from '@/shared/ui/toastStore'
import {
  parseCanvasDebugOptions,
} from '@/features/canvas/presentation/canvasDebugOptions'
import { useRouteLayoutPaneController } from '@/features/app-shell/application/useRouteLayoutPaneController'
import {
  CANVAS_WORKFLOW_PANE_ID,
  routeLayoutSpecForPathname,
} from '@/routes/routeLayoutRegistry'
import {
  CANVAS_NODE_META,
} from '@/features/canvas/presentation/nodeCatalog'
import {
  CANVAS_MINIMAP_NODE_LIMIT,
  SIDEBAR_HIDDEN_NODE_TYPES,
  canvasNodeIsAiProcessor,
  canvasNodeIsDone,
  canvasNodeIsRunning,
  canvasEditorNodeTypes,
  clampCanvasWorkflowPaneWidth,
} from '@/features/canvas/components/canvasEditorModel'
import {
  type CanvasClientPoint,
  type CanvasFlowCoordinateSpace,
} from '@/features/canvas/domain/layout'
import {
  acceptCanvasDropDragOver,
  readCanvasDropPayload,
} from '@/features/canvas/domain/canvasDropTarget'
import { isFinalOutputNode } from '@/features/canvas/domain/graph'
import { useCanvasExitController } from '@/features/canvas/application/useCanvasExitController'
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
import { useCanvasSaveShortcut } from '@/features/canvas/application/useCanvasBrowserGuards'
import { CanvasEditorAuxiliaryPanels } from '@/features/canvas/components/CanvasEditorAuxiliaryPanels'
import { CanvasEditorChromeBar } from '@/features/canvas/components/CanvasEditorChromeBar'
import { CanvasEditorNodePalette } from '@/features/canvas/components/CanvasEditorNodePalette'
import { CanvasEditorViewport } from '@/features/canvas/components/CanvasEditorViewport'
import {
  createCanvasEdgeId,
  createPaletteCanvasNode,
  createResourceCanvasNode,
  createWorkflowReferenceCanvasNode,
  isPaletteNodeTypeAvailable,
} from '@/features/canvas/editor/nodeFactory'
import {
  CanvasEditorContent,
  CanvasEditorMain,
  CanvasEditorShell,
} from '@/features/canvas/ui/CanvasEditorUi'
import { canvasBackPath } from '@/routes/appRouteModel'
import { useCanvasEditorRenderDiagnostics } from '@/features/canvas/presentation/useCanvasEditorRenderDiagnostics'
import { useCanvasEditorPaletteSections } from '@/features/canvas/presentation/useCanvasEditorPaletteSections'
import { useCanvasGroupEditing } from '@/features/canvas/presentation/useCanvasGroupEditing'
import { useInlineTitleEditor } from '@/features/canvas/presentation/useInlineTitleEditor'
import { useCanvasRuntimeControls } from '@/features/canvas/presentation/useCanvasRuntimeControls'
import { useCanvasViewportPerformanceState } from '@/features/canvas/presentation/useCanvasViewportPerformanceState'
import {
  canvasClientPointFromEvent,
  canvasDefaultClientPointFromViewportElement,
  canvasOverlayPointFromClient as canvasOverlayPointFromViewportElement,
  canvasViewportContextMenuBoundary,
  canvasViewportDropHitBoxFromEvent,
} from '@/features/canvas/presentation/canvasViewportGeometry'
import { useCanvasAppHeaderSync } from '@/features/canvas/presentation/useCanvasAppHeaderSync'

type CanvasContextMenuPosition = {
  client: CanvasClientPoint
  overlay: CanvasClientPoint
  boundary: { width: number; height: number }
}
export function CanvasWorkspace({ canvasId, embedded = false, useAppHeader = false, onClose }: {
  canvasId: number | string
  embedded?: boolean
  useAppHeader?: boolean
  onClose?: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { pathname, search } = useLocation()
  const { screenToFlowPosition, fitView } = useReactFlow()
  const id = String(canvasId)
  const routeLayout = useMemo(() => routeLayoutSpecForPathname(pathname), [pathname])
  const canvasDebug = useMemo(() => parseCanvasDebugOptions(search), [search])

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [canvasName, setCanvasName] = useState('')
  const [canvasType, setCanvasType] = useState<CanvasType>('inspiration')
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [menu, setMenu] = useState<CanvasContextMenuPosition | null>(null)
  const [libraryCollapsed, setLibraryCollapsed] = useState(true)
  const toggleLibraryCollapsed = useCallback(() => setLibraryCollapsed((value) => !value), [])
  const [dropActive, setDropActive] = useState(false)
  const viewportZoomRef = useRef(1)
  const viewportPositionRef = useRef({ x: 0, y: 0 })
  const canvasPaneRef = useRef<HTMLDivElement>(null)
  const {
    canvasMediaLightweightMode,
    canvasOverviewMode,
    gridZoomEligible,
    handleViewportMove,
  } = useCanvasViewportPerformanceState({
    canvasPaneRef,
    nodes,
    viewportPositionRef,
    viewportZoomRef,
  })

  const [workflowPanelCollapsed, setWorkflowPanelCollapsed] = useState(false)
  const workflowPane = useRouteLayoutPaneController({
    routeLayout,
    paneId: CANVAS_WORKFLOW_PANE_ID,
    clampSize: clampCanvasWorkflowPaneWidth,
    controlledState: workflowPanelCollapsed ? 'collapsed' : 'default',
    onStateChange: (state) => setWorkflowPanelCollapsed(state !== 'default'),
  })
  const toggleWorkflowPanelCollapsed = useCallback(() => {
    if (workflowPane.collapsed) workflowPane.show()
    else workflowPane.collapse()
  }, [workflowPane])
  const [runtimeStarting, setRuntimeStarting] = useState(false)
  const canvasCoordinateSpace = useMemo<CanvasFlowCoordinateSpace>(() => ({
    fromClient: (point) => screenToFlowPosition(point),
    defaultClientPoint: () => canvasDefaultClientPointFromViewportElement(canvasPaneRef.current),
  }), [screenToFlowPosition])
  const canvasOverlayPointFromClient = useCallback((point: CanvasClientPoint) => {
    return canvasOverlayPointFromViewportElement(point, canvasPaneRef.current)
  }, [])
  const openCanvasContextMenu = useCallback((point: CanvasClientPoint) => {
    setMenu({
      client: point,
      overlay: canvasOverlayPointFromClient(point),
      boundary: canvasViewportContextMenuBoundary(canvasPaneRef.current),
    })
  }, [canvasOverlayPointFromClient])
  // Load canvas
  const { data: canvas } = useQuery<Canvas>({
    queryKey: canvasKeys.detail(id),
    queryFn: () => api.get(`/canvases/${id}`).then((r) => r.data),
    enabled: !!id
  })
  const renameCanvas = useMutation({
    mutationFn: (name: string) => api.patch(`/canvases/${id}`, { name }).then((response) => response.data as Canvas),
    onMutate: async (name) => {
      const nextName = name.trim()
      const context = await prepareCanvasRenameMutation(queryClient, id, name)
      setCanvasName(nextName)
      return context
    },
    onError: (err: any, _name, context) => {
      const previousCanvas = restoreCanvasRenameMutation(queryClient, id, context)
      if (previousCanvas) setCanvasName(previousCanvas.name)
      toast.error(err?.response?.data?.error || err?.message || t('canvas.editor.renameFailed', { defaultValue: '重命名失败' }))
    },
    onSuccess: (nextCanvas) => {
      commitCanvasRenameMutation(queryClient, id, nextCanvas)
    },
    onSettled: () => {
      invalidateCanvasMutationResult(queryClient, canvasListChangedResult({ changedIds: [id] }))
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
    nodeResources: canvasNodeResources,
    nodeResourceById: canvasNodeResourceById,
    removingRunResultResourceId,
    removeRunResultResource,
  } = useCanvasResourceIntegration({
    removeFailedMessage: t('canvas.editor.runResults.removeFailed', { defaultValue: 'Failed to remove resource' }),
  })
  const {
    activeRun,
    activeRunId,
    handleConfirmNodeRun,
    handleConfirmRun,
    handleRunWorkflow,
    inputNodes,
    inputValues,
    nodeRunDialog,
    nodeRunValues,
    resultDialogRun,
    runDialogOpen,
    runHistoryPage,
    runNode,
    runStatusFilter,
    setActiveRunId,
    setInputValues,
    setNodeRunDialog,
    setNodeRunValues,
    setRunDialogOpen,
    setRunHistoryPage,
    setRunResultDialogRunId,
    setRunStatusFilter,
    setWorkflowPanelTab,
    workflowPanelTab,
    workflowRunPageCount,
    workflowRuns,
    workflowRunningCount,
    workflowRunTotal,
  } = useCanvasRuntimeControls({
    canvasId: id,
    canvasType,
    edges,
    nodes,
    persistCanvasGraph,
    projectId: canvas?.project_id,
    resourceById: canvasNodeResourceById,
    setNodes,
    setRuntimeStarting,
    t,
  })
  useCanvasWorkflowReferencePorts({ nodes, setNodes })
  const titleEditor = useInlineTitleEditor({
    value: canvasName,
    onCommit: (name) => renameCanvas.mutate(name),
  })
  const visiblePaletteSections = useCanvasEditorPaletteSections(canvasType)
  const {
    createGroupFromSelection,
    deleteSelectedNodes,
    draggingNodeId,
    handleNodeDragStop,
    onNodeDragStart,
    selectedGroupBounds,
    selectedUngroupBounds,
    topLevelSelectedGroups,
    topLevelSelectedNodes,
    ungroupSelectedGroups,
  } = useCanvasGroupEditing({
    nodes,
    setEdges,
    setNodes,
    setSelectedNodeIds,
    t,
  })

  // Approval
  function handleApprove(nodeId: string) {
    updateNodeData(nodeId, { approvalStatus: 'approved' })
  }
  function handleReject(nodeId: string) {
    updateNodeData(nodeId, { approvalStatus: 'rejected' })
  }

  const addNodeAt = useCallback((type: NodeType, clientPosition?: CanvasClientPoint) => {
    if (!isPaletteNodeTypeAvailable(type, canvasType) || SIDEBAR_HIDDEN_NODE_TYPES.has(type)) return
    const position = canvasCoordinateSpace.fromClient(clientPosition ?? canvasCoordinateSpace.defaultClientPoint())
    setNodes((prev) => [...prev, createPaletteCanvasNode({ type, position, t, existingNodes: prev })])
  }, [canvasCoordinateSpace, canvasType, t])

  const addResourceNodeAt = useCallback((resource: RawResource, clientPosition: CanvasClientPoint) => {
    const type = resourceToNodeType(resource)
    if (!type) {
      toast.error('暂不支持将该素材加入画布')
      return
    }
    const position = canvasCoordinateSpace.fromClient(clientPosition)
    const newNode = createResourceCanvasNode({ resource, type, position, t })
    setNodes((prev) => [...prev, newNode])
  }, [canvasCoordinateSpace, setNodes, t])

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

  const addWorkflowReferenceNodeAt = useCallback(async (workflowCanvas: Canvas, clientPosition: CanvasClientPoint) => {
    if (String(workflowCanvas.ID) === id) {
      toast.error(t('canvas.editor.errors.selfReferenceWorkflow', { defaultValue: 'A canvas cannot reference itself.' }))
      return
    }
    try {
      const referencedCanvas = workflowCanvas.nodes
        ? workflowCanvas
        : await api.get(`/canvases/${workflowCanvas.ID}`).then((r) => r.data as Canvas)
      if ((referencedCanvas.canvas_type ?? 'inspiration') !== 'workflow') return
      const position = canvasCoordinateSpace.fromClient(clientPosition)
      const newNode = createWorkflowReferenceCanvasNode({ workflowCanvas: referencedCanvas, position, t })
      setNodes((prev) => [...prev, newNode])
    } catch (err: any) {
      toast.error(err?.response?.data?.error || err?.message || t('canvas.editor.errors.workflowReferenceFailed', { defaultValue: 'Failed to add workflow reference.' }))
    }
  }, [canvasCoordinateSpace, id, setNodes, t])

  // Add node from context menu
  const addNode = useCallback((type: NodeType) => {
    if (!menu) return
    addNodeAt(type, menu.client)
  }, [addNodeAt, menu])

  useCanvasSaveShortcut(save.mutate)

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
    openCanvasContextMenu(canvasClientPointFromEvent(e))
  }, [openCanvasContextMenu])

  // Right-click on a selection (multi-select) → show context menu
  const onSelectionContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    openCanvasContextMenu(canvasClientPointFromEvent(e))
  }, [openCanvasContextMenu])

  // Right-click on a single node → show context menu
  const onNodeContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    openCanvasContextMenu(canvasClientPointFromEvent(e))
  }, [openCanvasContextMenu])

  const uploadDroppedFilesToCanvas = useCallback(async (files: File[], clientPosition: CanvasClientPoint) => {
    const supportedFiles = files.filter((file) => fileToCanvasResourceNodeType(file))
    if (supportedFiles.length === 0) {
      toast.error(t('canvas.editor.errors.unsupportedDropFiles', { defaultValue: 'No supported image, video, or text files found.' }))
      return
    }
    const basePosition = canvasCoordinateSpace.fromClient(clientPosition)
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
  }, [addResourceNodeAtFlowPosition, canvasCoordinateSpace, t])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDropActive(false)
    const clientPoint = canvasClientPointFromEvent(e)
    const payload = readCanvasDropPayload(e.dataTransfer, {
      isNodeTypeAllowed: (nodeType) => Boolean(CANVAS_NODE_META[nodeType]),
    })
    if (!payload) return
    const hitBox = canvasViewportDropHitBoxFromEvent({ event: e, viewport: canvasPaneRef.current, payload })
    if (!hitBox) return
    switch (payload.kind) {
      case 'files':
        void uploadDroppedFilesToCanvas(payload.files, clientPoint)
        return
      case 'resource':
        addResourceNodeAt(payload.resource, clientPoint)
        return
      case 'workflow-canvas':
        void addWorkflowReferenceNodeAt(payload.canvas, clientPoint)
        return
      case 'canvas-node-template':
        addNodeAt(payload.nodeType, clientPoint)
        return
    }
  }, [addNodeAt, addResourceNodeAt, addWorkflowReferenceNodeAt, uploadDroppedFilesToCanvas])

  const onDragOver = useCallback((e: React.DragEvent) => {
    const hitBox = canvasViewportDropHitBoxFromEvent({ event: e, viewport: canvasPaneRef.current })
    if (!acceptCanvasDropDragOver({ dataTransfer: e.dataTransfer, hitBox })) return
    e.preventDefault()
    setDropActive(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget === e.target) setDropActive(false)
  }, [])

  const nodesWithHandlers = useMemo(() => {
    const nodeById = new Map(nodes.map((node) => [node.id, node]))
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
          onRun: n.type !== 'group' && n.type !== 'plugin_card' ? () => runNode(n.id) : undefined,
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
  }, [canvasDebug, canvasMediaLightweightMode, canvasNodeResourceById, canvasNodeResources, canvasOverviewMode, edges, id, nodes, runNode, updateNodeData])

  const selectedNode = selectedNodeIds.length > 0
    ? nodes.find((n) => n.id === selectedNodeIds[selectedNodeIds.length - 1])
    : undefined
  const selectedNodeData = selectedNode?.data as (CanvasNodeData & { label?: string }) | undefined
  const runningCount = nodes.filter(canvasNodeIsRunning).length
  const doneCount = nodes.filter(canvasNodeIsDone).length
  const workflowStats = { inputs: nodes.filter((n) => n.type === 'input').length, processors: nodes.filter(canvasNodeIsAiProcessor).length, outputs: nodes.filter((n) => n.type === 'output').length }
  const activeRunStatusLabel = activeRun ? t(`canvas.runStatus.${activeRun.status}`) : undefined
  const selectedNodeMeta = selectedNode?.type ? CANVAS_NODE_META[selectedNode.type as NodeType] : undefined
  const savingCanvas = save.isPending || autoSaveState === 'saving' || renameCanvas.isPending
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
  useCanvasEditorRenderDiagnostics({
    canvasDebug,
    canvasId,
    canvasMediaLightweightMode,
    canvasNodeResources,
    canvasPaneRef,
    canvasType,
    edges,
    id,
    libraryCollapsed,
    nodes,
    renderedNodesCount: renderedNodes.length,
    runningCount,
    selectedCount: selectedNodeIds.length,
    showCanvasGrid,
    showCanvasMinimap,
    visibleEdgesCount: visibleEdges.length,
    viewportZoomRef,
    workflowPanelCollapsed,
  })

  const requestCanvasExit = useCanvasExitController({
    edges,
    hasUnsavedChanges,
    nodes,
    persistCanvasGraph,
    runningCount,
    runtimeStarting,
    savingCanvas,
    setAutoSaveState,
    t,
  })

  useCanvasAppHeaderSync({
    activeRun,
    activeRunStatusLabel,
    canvasName,
    canvasType,
    doneCount,
    inputCount: workflowStats.inputs,
    libraryCollapsed,
    nodeCount: nodes.length,
    onNameChange: (name) => renameCanvas.mutate(name),
    onRun: handleRunWorkflow,
    onSave: () => save.mutate(),
    onToggleLibrary: toggleLibraryCollapsed,
    onToggleWorkflowPanel: toggleWorkflowPanelCollapsed,
    outputCount: workflowStats.outputs,
    processorCount: workflowStats.processors,
    runningCount,
    saving: savingCanvas,
    startingRun: runtimeStarting,
    t,
    useAppHeader,
    workflowPanelCollapsed,
    workflowRunningCount,
  })

  return (
    <CanvasEditorShell embedded={embedded}>
      {!useAppHeader && (
        <CanvasEditorChromeBar
          activeRun={activeRun}
          activeRunStatusLabel={activeRunStatusLabel}
          canvasName={canvasName}
          canvasType={canvasType}
          doneCount={doneCount}
          embedded={embedded}
          hasUnsavedChanges={hasUnsavedChanges}
          libraryCollapsed={libraryCollapsed}
          nodeCount={nodes.length}
          onBack={() => void requestCanvasExit(() => navigate(canvasBackPath(search)))}
          onClose={onClose ? () => void requestCanvasExit(onClose) : undefined}
          onRunWorkflow={handleRunWorkflow}
          onSave={() => save.mutate()}
          onToggleLibrary={toggleLibraryCollapsed}
          renamePending={renameCanvas.isPending}
          runningCount={runningCount}
          runtimeStarting={runtimeStarting}
          savingCanvas={savingCanvas}
          t={t}
          titleEditor={titleEditor}
          workflowRunningCount={workflowRunningCount}
          workflowStats={workflowStats}
        />
      )}

      <CanvasEditorMain>
        <CanvasEditorNodePalette
          collapsed={libraryCollapsed}
          sections={visiblePaletteSections}
          onAddNode={addNodeAt}
          t={t}
        />

        <CanvasEditorContent>
          <CanvasEditorViewport
            canvasDebug={canvasDebug}
            canvasOverviewMode={canvasOverviewMode}
            canvasPaneRef={canvasPaneRef}
            canvasType={canvasType}
            createGroupFromSelection={createGroupFromSelection}
            deleteSelectedNodes={deleteSelectedNodes}
            draggingNodeId={draggingNodeId}
            dropActive={dropActive}
            handleNodeDragStop={handleNodeDragStop}
            handleNodesChange={handleNodesChange}
            handleViewportMove={handleViewportMove}
            menu={menu}
            nodeTypes={canvasEditorNodeTypes}
            nodes={nodes}
            onAddNode={addNode}
            onConnect={onConnect}
            onDragLeave={onDragLeave}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onNodeContextMenu={onNodeContextMenu}
            onNodeDragStart={onNodeDragStart}
            onPaneContextMenu={onPaneContextMenu}
            onSelectionContextMenu={onSelectionContextMenu}
            renderedNodes={renderedNodes}
            selectedGroupBounds={selectedGroupBounds ?? undefined}
            selectedNode={selectedNode}
            selectedNodeData={selectedNodeData}
            selectedNodeMeta={selectedNodeMeta}
            selectedUngroupBounds={selectedUngroupBounds ?? undefined}
            onCloseMenu={() => setMenu(null)}
            showCanvasGrid={showCanvasGrid}
            showCanvasMinimap={showCanvasMinimap}
            t={t}
            topLevelSelectedGroups={topLevelSelectedGroups}
            topLevelSelectedNodes={topLevelSelectedNodes}
            ungroupSelectedGroups={ungroupSelectedGroups}
            visibleEdges={visibleEdges}
          />

          <CanvasEditorAuxiliaryPanels
            activeRunId={activeRunId}
            canvasDebug={canvasDebug}
            currentCanvasId={Number(id)}
            inputNodes={inputNodes}
            inputValues={inputValues}
            nodeRunDialog={nodeRunDialog}
            nodeRunValues={nodeRunValues}
            nodes={nodes}
            onAddWorkflowReference={(workflowCanvas) => {
              void addWorkflowReferenceNodeAt(workflowCanvas, canvasCoordinateSpace.defaultClientPoint())
            }}
            onCancelNodeRun={() => {
              setNodeRunDialog(null)
              setNodeRunValues({})
            }}
            onCancelRun={() => setRunDialogOpen(false)}
            onCloseRunResultDialog={() => setRunResultDialogRunId(null)}
            onConfirmNodeRun={handleConfirmNodeRun}
            onConfirmRun={handleConfirmRun}
            onRemoveRunResultResource={(resourceId) => removeRunResultResource.mutateAsync(resourceId).then(() => undefined)}
            projectId={canvas?.project_id}
            removingRunResultResourceId={removingRunResultResourceId}
            resultDialogRun={resultDialogRun}
            runDialogOpen={runDialogOpen}
            runHistoryPage={runHistoryPage}
            runStatusFilter={runStatusFilter}
            setActiveRunId={setActiveRunId}
            setInputValues={setInputValues}
            setNodeRunValues={setNodeRunValues}
            setRunHistoryPage={setRunHistoryPage}
            setRunStatusFilter={setRunStatusFilter}
            setWorkflowPanelTab={setWorkflowPanelTab}
            t={t}
            workflowPane={workflowPane}
            workflowPanelTab={workflowPanelTab}
            workflowRunPageCount={workflowRunPageCount}
            workflowRuns={workflowRuns}
            workflowRunTotal={workflowRunTotal}
          />
        </CanvasEditorContent>
      </CanvasEditorMain>
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
