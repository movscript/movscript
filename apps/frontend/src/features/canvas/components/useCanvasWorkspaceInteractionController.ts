import { useCallback, type Dispatch, type SetStateAction, type MouseEvent as ReactMouseEvent } from 'react'
import type { TFunction } from 'i18next'
import type { Edge, Node } from '@xyflow/react'

import type { CanvasNodeData, CanvasType } from '@/types'
import { useCanvasWorkflowReferencePorts } from '@/features/canvas/integrations/workflowReferences'
import { useCanvasConnectionController } from '@/features/canvas/presentation/useCanvasConnectionController'
import { useCanvasDropController } from '@/features/canvas/presentation/useCanvasDropController'
import { useCanvasGroupEditing } from '@/features/canvas/presentation/useCanvasGroupEditing'
import { useCanvasNodeChangeController } from '@/features/canvas/presentation/useCanvasNodeChangeController'
import { useCanvasNodeCreationController } from '@/features/canvas/presentation/useCanvasNodeCreationController'

type NodeCreationInput = Parameters<typeof useCanvasNodeCreationController>[0]
type NodeChangeInput = Parameters<typeof useCanvasNodeChangeController>[0]

interface UseCanvasWorkspaceInteractionControllerInput {
  canvasId: string
  canvasPaneRef: NodeCreationInput['canvasPaneRef']
  canvasType: CanvasType
  edges: Edge[]
  menu: NodeCreationInput['menu']
  nodes: Node[]
  onNodesChange: NodeChangeInput['onNodesChange']
  screenToFlowPosition: NodeCreationInput['screenToFlowPosition']
  setEdges: Dispatch<SetStateAction<Edge[]>>
  setNodes: Dispatch<SetStateAction<Node[]>>
  setSelectedNodeIds: Dispatch<SetStateAction<string[]>>
  t: TFunction
}

export function useCanvasWorkspaceInteractionController({
  canvasId,
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
}: UseCanvasWorkspaceInteractionControllerInput) {
  useCanvasWorkflowReferencePorts({ nodes, setNodes })

  const groupEditing = useCanvasGroupEditing({
    nodes,
    setEdges,
    setNodes,
    setSelectedNodeIds,
    t,
  })
  const nodeCreation = useCanvasNodeCreationController({
    canvasId,
    canvasPaneRef,
    canvasType,
    menu,
    screenToFlowPosition,
    setNodes,
    t,
  })
  const handleNodesChange = useCanvasNodeChangeController({
    nodes,
    onNodesChange,
    setSelectedNodeIds,
  })

  const updateNodeData = useCallback((nodeId: string, patch: Partial<CanvasNodeData & { label: string }>) => {
    setNodes((prev) => prev.map((n) => {
      if (n.id !== nodeId) return n
      return { ...n, data: { ...n.data, ...patch } }
    }))
  }, [])

  const onConnect = useCanvasConnectionController({ edges, nodes, setEdges, t })
  const onNodeClick = useCallback((_: ReactMouseEvent, _node: Node) => {
    // Selection is handled by ReactFlow.
  }, [])
  const dropController = useCanvasDropController({
    addNodeAt: nodeCreation.addNodeAt,
    addWorkflowReferenceNodeAt: nodeCreation.addWorkflowReferenceNodeAt,
    canvasCoordinateSpace: nodeCreation.canvasCoordinateSpace,
    canvasPaneRef,
    setNodes,
    t,
  })

  return {
    ...groupEditing,
    ...nodeCreation,
    ...dropController,
    handleNodesChange,
    onConnect,
    onNodeClick,
    updateNodeData,
  }
}
