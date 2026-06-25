import { useCallback, useMemo, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { Node } from '@xyflow/react'

import {
  SIDEBAR_HIDDEN_NODE_TYPES,
} from '../components/canvasEditorModel'
import {
  type CanvasClientPoint,
  type CanvasFlowCoordinateSpace,
  type CanvasFlowPoint,
} from '../domain/layout'
import {
  createPaletteCanvasNode,
  isPaletteNodeTypeAvailable,
} from '../editor/nodeFactory'
import {
  canvasDefaultClientPointFromViewportElement,
} from './canvasViewportGeometry'
import type { CanvasContextMenuPosition } from './useCanvasContextMenuController'
import { useCanvasWorkflowReferenceNodeActions } from './useCanvasWorkflowReferenceNodeActions'
import type { CanvasType, NodeType } from '@movscript/shared'

export function useCanvasNodeCreationController({
  canvasId,
  canvasPaneRef,
  canvasType,
  menu,
  screenToFlowPosition,
  setNodes,
  t,
}: {
  canvasId: string
  canvasPaneRef: RefObject<HTMLDivElement | null>
  canvasType: CanvasType
  menu: CanvasContextMenuPosition | null
  screenToFlowPosition: (point: CanvasClientPoint) => CanvasFlowPoint
  setNodes: Dispatch<SetStateAction<Node[]>>
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  const canvasCoordinateSpace = useMemo<CanvasFlowCoordinateSpace>(() => ({
    fromClient: (point) => screenToFlowPosition(point),
    defaultClientPoint: () => canvasDefaultClientPointFromViewportElement(canvasPaneRef.current),
  }), [canvasPaneRef, screenToFlowPosition])

  const addNodeAt = useCallback((type: NodeType, clientPosition?: CanvasClientPoint) => {
    if (!isPaletteNodeTypeAvailable(type, canvasType) || SIDEBAR_HIDDEN_NODE_TYPES.has(type)) return
    const position = canvasCoordinateSpace.fromClient(clientPosition ?? canvasCoordinateSpace.defaultClientPoint())
    setNodes((prev) => [...prev, createPaletteCanvasNode({ type, position, t, existingNodes: prev })])
  }, [canvasCoordinateSpace, canvasType, setNodes, t])

  const { addWorkflowReferenceNodeAt } = useCanvasWorkflowReferenceNodeActions({
    canvasCoordinateSpace,
    canvasId,
    setNodes,
    t,
  })

  const addNode = useCallback((type: NodeType) => {
    if (!menu) return
    addNodeAt(type, menu.client)
  }, [addNodeAt, menu])

  return {
    addNode,
    addNodeAt,
    addWorkflowReferenceNodeAt,
    canvasCoordinateSpace,
  }
}
