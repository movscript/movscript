import { useCallback, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { api } from '@/shared/infrastructure/api'
import { canvasKeys } from '@/features/canvas/application/canvasQueryKeys'
import type { Canvas, CanvasNodeData, CanvasType, NodeType } from '@/types'
import { useCanvasWorkflowReferencePorts } from '@/features/canvas/integrations/workflowReferences'
import {
  useCanvasResourceIntegration,
} from '@/features/canvas/integrations/resources'
import {
  SIDEBAR_HIDDEN_NODE_TYPES,
  canvasEditorNodeTypes,
} from '@/features/canvas/components/canvasEditorModel'
import {
  type CanvasClientPoint,
  type CanvasFlowCoordinateSpace,
} from '@/features/canvas/domain/layout'
import { useCanvasExitController } from '@/features/canvas/application/useCanvasExitController'
import { useCanvasDocument } from '@/features/canvas/editor/useCanvasDocument'
import { useCanvasSaveShortcut } from '@/features/canvas/application/useCanvasBrowserGuards'
import { useCanvasWorkspaceRouteControls } from '@/features/canvas/application/useCanvasWorkspaceRouteControls'
import { CanvasEditorWorkspaceView } from '@/features/canvas/components/CanvasEditorWorkspaceView'
import {
  createPaletteCanvasNode,
  isPaletteNodeTypeAvailable,
} from '@/features/canvas/editor/nodeFactory'
import { useCanvasEditorRenderDiagnostics } from '@/features/canvas/presentation/useCanvasEditorRenderDiagnostics'
import { useCanvasEditorPaletteSections } from '@/features/canvas/presentation/useCanvasEditorPaletteSections'
import { useCanvasGroupEditing } from '@/features/canvas/presentation/useCanvasGroupEditing'
import { useInlineTitleEditor } from '@/features/canvas/presentation/useInlineTitleEditor'
import { useCanvasRuntimeControls } from '@/features/canvas/presentation/useCanvasRuntimeControls'
import { useCanvasViewportPerformanceState } from '@/features/canvas/presentation/useCanvasViewportPerformanceState'
import { useCanvasConnectionController } from '@/features/canvas/presentation/useCanvasConnectionController'
import { useCanvasDropController } from '@/features/canvas/presentation/useCanvasDropController'
import { useCanvasEditorRenderModel } from '@/features/canvas/presentation/useCanvasEditorRenderModel'
import {
  canvasDefaultClientPointFromViewportElement,
} from '@/features/canvas/presentation/canvasViewportGeometry'
import { useCanvasAppHeaderSync } from '@/features/canvas/presentation/useCanvasAppHeaderSync'
import { useCanvasRenameController } from '@/features/canvas/application/useCanvasRenameController'
import { useCanvasContextMenuController } from '@/features/canvas/presentation/useCanvasContextMenuController'
import { useCanvasEditorViewState } from '@/features/canvas/presentation/useCanvasEditorViewState'
import { useCanvasWorkflowReferenceNodeActions } from '@/features/canvas/presentation/useCanvasWorkflowReferenceNodeActions'
import { useCanvasNodeChangeController } from '@/features/canvas/presentation/useCanvasNodeChangeController'

export function CanvasWorkspace({ canvasId, embedded = false, useAppHeader = false, onClose }: {
  canvasId: number | string
  embedded?: boolean
  useAppHeader?: boolean
  onClose?: () => void
}) {
  const { t } = useTranslation()
  const { screenToFlowPosition, fitView } = useReactFlow()
  const id = String(canvasId)
  const {
    canvasDebug,
    navigateBack,
    toggleWorkflowPanelCollapsed,
    workflowPane,
    workflowPanelCollapsed,
  } = useCanvasWorkspaceRouteControls()

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [canvasName, setCanvasName] = useState('')
  const [canvasType, setCanvasType] = useState<CanvasType>('inspiration')
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [libraryCollapsed, setLibraryCollapsed] = useState(true)
  const toggleLibraryCollapsed = useCallback(() => setLibraryCollapsed((value) => !value), [])
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

  const [runtimeStarting, setRuntimeStarting] = useState(false)
  const canvasCoordinateSpace = useMemo<CanvasFlowCoordinateSpace>(() => ({
    fromClient: (point) => screenToFlowPosition(point),
    defaultClientPoint: () => canvasDefaultClientPointFromViewportElement(canvasPaneRef.current),
  }), [screenToFlowPosition])
  const {
    menu,
    closeCanvasContextMenu,
    onNodeContextMenu,
    onPaneContextMenu,
    onSelectionContextMenu,
  } = useCanvasContextMenuController({ canvasPaneRef })
  // Load canvas
  const { data: canvas } = useQuery<Canvas>({
    queryKey: canvasKeys.detail(id),
    queryFn: () => api.get(`/canvases/${id}`).then((r) => r.data),
    enabled: !!id
  })
  const renameCanvas = useCanvasRenameController({
    canvasId: id,
    setCanvasName,
    t,
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

  const addNodeAt = useCallback((type: NodeType, clientPosition?: CanvasClientPoint) => {
    if (!isPaletteNodeTypeAvailable(type, canvasType) || SIDEBAR_HIDDEN_NODE_TYPES.has(type)) return
    const position = canvasCoordinateSpace.fromClient(clientPosition ?? canvasCoordinateSpace.defaultClientPoint())
    setNodes((prev) => [...prev, createPaletteCanvasNode({ type, position, t, existingNodes: prev })])
  }, [canvasCoordinateSpace, canvasType, t])
  const { addWorkflowReferenceNodeAt } = useCanvasWorkflowReferenceNodeActions({
    canvasCoordinateSpace,
    canvasId: id,
    setNodes,
    t,
  })

  // Add node from context menu
  const addNode = useCallback((type: NodeType) => {
    if (!menu) return
    addNodeAt(type, menu.client)
  }, [addNodeAt, menu])

  useCanvasSaveShortcut(save.mutate)

  const handleNodesChange = useCanvasNodeChangeController({
    nodes,
    onNodesChange,
    setSelectedNodeIds,
  })

  // Update node data
  const updateNodeData = useCallback((nodeId: string, patch: Partial<CanvasNodeData & { label: string }>) => {
    setNodes((prev) => prev.map((n) => {
      if (n.id !== nodeId) return n
      return { ...n, data: { ...n.data, ...patch } }
    }))
  }, [])

  const onConnect = useCanvasConnectionController({ edges, nodes, setEdges, t })

  const onNodeClick = useCallback((_: React.MouseEvent, _node: Node) => {
    // Selection is handled by ReactFlow.
  }, [])

  const {
    dropActive,
    onDragLeave,
    onDragOver,
    onDrop,
  } = useCanvasDropController({
    addNodeAt,
    addWorkflowReferenceNodeAt,
    canvasCoordinateSpace,
    canvasPaneRef,
    setNodes,
    t,
  })

  const runStatusLabel = useCallback((status: string) => t(`canvas.runStatus.${status}`), [t])
  const {
    activeRunStatusLabel,
    doneCount,
    runningCount,
    savingCanvas,
    selectedNode,
    selectedNodeData,
    selectedNodeMeta,
    showCanvasGrid,
    showCanvasMinimap,
    workflowStats,
  } = useCanvasEditorViewState({
    activeRun,
    autoSaveState,
    canvasDebug,
    canvasOverviewMode,
    gridZoomEligible,
    nodes,
    renamePending: renameCanvas.isPending,
    runStatusLabel,
    savePending: save.isPending,
    selectedNodeIds,
  })
  const { renderedNodes, visibleEdges } = useCanvasEditorRenderModel({
    canvasDebug,
    canvasId: id,
    canvasMediaLightweightMode,
    canvasNodeResourceById,
    canvasNodeResources,
    canvasOverviewMode,
    edges,
    nodes,
    runNode,
    updateNodeData,
  })
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
    <CanvasEditorWorkspaceView
      auxiliaryPanelsProps={{
        activeRunId,
        canvasDebug,
        currentCanvasId: Number(id),
        inputNodes,
        inputValues,
        nodeRunDialog,
        nodeRunValues,
        nodes,
        onAddWorkflowReference: (workflowCanvas) => {
          void addWorkflowReferenceNodeAt(workflowCanvas, canvasCoordinateSpace.defaultClientPoint())
        },
        onCancelNodeRun: () => {
          setNodeRunDialog(null)
          setNodeRunValues({})
        },
        onCancelRun: () => setRunDialogOpen(false),
        onCloseRunResultDialog: () => setRunResultDialogRunId(null),
        onConfirmNodeRun: handleConfirmNodeRun,
        onConfirmRun: handleConfirmRun,
        onRemoveRunResultResource: (resourceId) => removeRunResultResource.mutateAsync(resourceId).then(() => undefined),
        projectId: canvas?.project_id,
        removingRunResultResourceId,
        resultDialogRun,
        runDialogOpen,
        runHistoryPage,
        runStatusFilter,
        setActiveRunId,
        setInputValues,
        setNodeRunValues,
        setRunHistoryPage,
        setRunStatusFilter,
        setWorkflowPanelTab,
        t,
        workflowPane,
        workflowPanelTab,
        workflowRunPageCount,
        workflowRuns,
        workflowRunTotal,
      }}
      chromeBarProps={{
        activeRun,
        activeRunStatusLabel,
        canvasName,
        canvasType,
        doneCount,
        embedded,
        hasUnsavedChanges,
        libraryCollapsed,
        nodeCount: nodes.length,
        onBack: () => void requestCanvasExit(navigateBack),
        onClose: onClose ? () => void requestCanvasExit(onClose) : undefined,
        onRunWorkflow: handleRunWorkflow,
        onSave: () => save.mutate(),
        onToggleLibrary: toggleLibraryCollapsed,
        renamePending: renameCanvas.isPending,
        runningCount,
        runtimeStarting,
        savingCanvas,
        t,
        titleEditor,
        workflowRunningCount,
        workflowStats,
      }}
      embedded={embedded}
      paletteProps={{
        collapsed: libraryCollapsed,
        onAddNode: addNodeAt,
        sections: visiblePaletteSections,
        t,
      }}
      useAppHeader={useAppHeader}
      viewportProps={{
        canvasDebug,
        canvasOverviewMode,
        canvasPaneRef,
        canvasType,
        createGroupFromSelection,
        deleteSelectedNodes,
        draggingNodeId,
        dropActive,
        handleNodeDragStop,
        handleNodesChange,
        handleViewportMove,
        menu,
        nodeTypes: canvasEditorNodeTypes,
        nodes,
        onAddNode: addNode,
        onCloseMenu: closeCanvasContextMenu,
        onConnect,
        onDragLeave,
        onDragOver,
        onDrop,
        onEdgesChange,
        onNodeClick,
        onNodeContextMenu,
        onNodeDragStart,
        onPaneContextMenu,
        onSelectionContextMenu,
        renderedNodes,
        selectedGroupBounds: selectedGroupBounds ?? undefined,
        selectedNode,
        selectedNodeData,
        selectedNodeMeta,
        selectedUngroupBounds: selectedUngroupBounds ?? undefined,
        showCanvasGrid,
        showCanvasMinimap,
        t,
        topLevelSelectedGroups,
        topLevelSelectedNodes,
        ungroupSelectedGroups,
        visibleEdges,
      }}
    />
  )
}
