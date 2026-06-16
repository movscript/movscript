import { useMemo } from 'react'
import type { Node } from '@xyflow/react'

import type { CanvasNodeData, NodeType } from '@/types'
import { CANVAS_NODE_META } from '@/features/canvas/presentation/nodeCatalog'
import {
  CANVAS_MINIMAP_NODE_LIMIT,
  canvasNodeIsAiProcessor,
  canvasNodeIsDone,
  canvasNodeIsRunning,
} from '@/features/canvas/components/canvasEditorModel'

export interface CanvasEditorViewStateInput {
  activeRun?: { status: string } | null
  autoSaveState: string
  canvasDebug: { grid: boolean; minimap: boolean }
  canvasOverviewMode: boolean
  gridZoomEligible: boolean
  nodes: Node[]
  renamePending: boolean
  savePending: boolean
  selectedNodeIds: string[]
  runStatusLabel: (status: string) => string
}

export function useCanvasEditorViewState({
  activeRun,
  autoSaveState,
  canvasDebug,
  canvasOverviewMode,
  gridZoomEligible,
  nodes,
  renamePending,
  savePending,
  selectedNodeIds,
  runStatusLabel,
}: CanvasEditorViewStateInput) {
  return useMemo(() => {
    const selectedNode = selectedNodeIds.length > 0
      ? nodes.find((node) => node.id === selectedNodeIds[selectedNodeIds.length - 1])
      : undefined
    const selectedNodeData = selectedNode?.data as (CanvasNodeData & { label?: string }) | undefined
    const runningCount = nodes.filter(canvasNodeIsRunning).length
    const doneCount = nodes.filter(canvasNodeIsDone).length
    const workflowStats = {
      inputs: nodes.filter((node) => node.type === 'input').length,
      processors: nodes.filter(canvasNodeIsAiProcessor).length,
      outputs: nodes.filter((node) => node.type === 'output').length,
    }

    return {
      activeRunStatusLabel: activeRun ? runStatusLabel(activeRun.status) : undefined,
      doneCount,
      runningCount,
      savingCanvas: savePending || autoSaveState === 'saving' || renamePending,
      selectedNode,
      selectedNodeData,
      selectedNodeMeta: selectedNode?.type ? CANVAS_NODE_META[selectedNode.type as NodeType] : undefined,
      showCanvasGrid: canvasDebug.grid && gridZoomEligible && !canvasOverviewMode,
      showCanvasMinimap: canvasDebug.minimap && !canvasOverviewMode && nodes.length <= CANVAS_MINIMAP_NODE_LIMIT,
      workflowStats,
    }
  }, [
    activeRun,
    autoSaveState,
    canvasDebug.grid,
    canvasDebug.minimap,
    canvasOverviewMode,
    gridZoomEligible,
    nodes,
    renamePending,
    runStatusLabel,
    savePending,
    selectedNodeIds,
  ])
}
