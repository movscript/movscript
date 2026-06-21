import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useReactFlow } from '@xyflow/react'

import { useCanvasExitController } from '@/features/canvas/application/useCanvasExitController'
import { useCanvasSaveShortcut } from '@/features/canvas/application/useCanvasBrowserGuards'
import { useCanvasWorkspaceDocumentState } from '@/features/canvas/application/useCanvasWorkspaceDocumentState'
import { useCanvasWorkspaceRouteControls } from '@/features/canvas/application/useCanvasWorkspaceRouteControls'
import { CanvasEditorWorkspaceView } from '@/features/canvas/components/CanvasEditorWorkspaceView'
import { canvasEditorNodeTypes } from '@/features/canvas/components/canvasEditorModel'
import { useCanvasWorkspaceInteractionController } from '@/features/canvas/components/useCanvasWorkspaceInteractionController'
import { useCanvasWorkspaceRuntimeController } from '@/features/canvas/components/useCanvasWorkspaceRuntimeController'
import { useCanvasAppHeaderSync } from '@/features/canvas/presentation/useCanvasAppHeaderSync'
import { useCanvasContextMenuController } from '@/features/canvas/presentation/useCanvasContextMenuController'
import { useCanvasEditorPaletteSections } from '@/features/canvas/presentation/useCanvasEditorPaletteSections'
import { useCanvasEditorRenderDiagnostics } from '@/features/canvas/presentation/useCanvasEditorRenderDiagnostics'
import { useCanvasEditorRenderModel } from '@/features/canvas/presentation/useCanvasEditorRenderModel'
import { useCanvasEditorViewState } from '@/features/canvas/presentation/useCanvasEditorViewState'
import { useCanvasWorkspaceCoreState } from '@/features/canvas/presentation/useCanvasWorkspaceCoreState'
import { useInlineTitleEditor } from '@/features/canvas/presentation/useInlineTitleEditor'

export interface CanvasWorkspaceControllerInput {
  canvasId: number | string
  embedded?: boolean
  onClose?: () => void
  useAppHeader?: boolean
}

type CanvasEditorWorkspaceViewProps = Parameters<typeof CanvasEditorWorkspaceView>[0]

export function useCanvasWorkspaceController({
  canvasId,
  embedded = false,
  onClose,
  useAppHeader = false,
}: CanvasWorkspaceControllerInput): CanvasEditorWorkspaceViewProps {
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

  const {
    canvasName,
    canvasPaneRef,
    canvasMediaLightweightMode,
    canvasType,
    edges,
    canvasOverviewMode,
    gridZoomEligible,
    handleViewportMove,
    nodes,
    libraryCollapsed,
    onEdgesChange,
    onNodesChange,
    runtimeStarting,
    selectedNodeIds,
    setCanvasName,
    setCanvasType,
    setEdges,
    setNodes,
    setRuntimeStarting,
    setSelectedNodeIds,
    toggleLibraryCollapsed,
    viewportZoomRef,
  } = useCanvasWorkspaceCoreState()
  const {
    menu,
    closeCanvasContextMenu,
    onNodeContextMenu,
    onPaneContextMenu,
    onSelectionContextMenu,
  } = useCanvasContextMenuController({ canvasPaneRef })
  const {
    canvas,
    renameCanvas,
    hasUnsavedChanges,
    autoSaveState,
    setAutoSaveState,
    persistCanvasGraph,
    save,
  } = useCanvasWorkspaceDocumentState({
    canvasId: id,
    canvasType,
    edges,
    fitView,
    nodes,
    runtimeStarting,
    setCanvasName,
    setCanvasType,
    setEdges,
    setNodes,
    t,
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
    nodeResources: canvasNodeResources,
    nodeResourceById: canvasNodeResourceById,
    removingRunResultResourceId,
    removeRunResultResource,
  } = useCanvasWorkspaceRuntimeController({
    canvasId: id,
    canvasType,
    edges,
    nodes,
    persistCanvasGraph,
    projectId: canvas?.project_id,
    removeFailedMessage: t('canvas.editor.runResults.removeFailed', { defaultValue: 'Failed to remove resource' }),
    setNodes,
    setRuntimeStarting,
    t,
  })
  const titleEditor = useInlineTitleEditor({
    value: canvasName,
    onCommit: (name) => renameCanvas.mutate(name),
  })
  const visiblePaletteSections = useCanvasEditorPaletteSections(canvasType)
  const {
    addNode,
    addNodeAt,
    addWorkflowReferenceNodeAt,
    canvasCoordinateSpace,
    createGroupFromSelection,
    deleteSelectedNodes,
    draggingNodeId,
    dropActive,
    handleNodeDragStop,
    handleNodesChange,
    onConnect,
    onDragLeave,
    onDragOver,
    onDrop,
    onNodeClick,
    onNodeDragStart,
    selectedGroupBounds,
    selectedUngroupBounds,
    topLevelSelectedGroups,
    topLevelSelectedNodes,
    ungroupSelectedGroups,
    updateNodeData,
  } = useCanvasWorkspaceInteractionController({
    canvasId: id,
    canvasPaneRef,
    canvasType,
    edges,
    menu,
    nodes,
    onNodesChange,
    screenToFlowPosition,
    setEdges,
    setNodes,
    setSelectedNodeIds,
    t,
  })

  useCanvasSaveShortcut(save.mutate)

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

  return {
    auxiliaryPanelsProps: {
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
    },
    chromeBarProps: {
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
    },
    embedded,
    paletteProps: {
      collapsed: libraryCollapsed,
      onAddNode: addNodeAt,
      sections: visiblePaletteSections,
      t,
    },
    useAppHeader,
    viewportProps: {
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
    },
  }
}
