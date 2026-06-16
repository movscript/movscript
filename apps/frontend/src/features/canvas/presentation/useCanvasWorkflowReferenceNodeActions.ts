import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { Node } from '@xyflow/react'

import { api } from '@/shared/infrastructure/api'
import { toast } from '@/shared/ui/toastStore'
import type { Canvas } from '@/types'
import type { CanvasClientPoint, CanvasFlowCoordinateSpace } from '@/features/canvas/domain/layout'
import { createWorkflowReferenceCanvasNode } from '@/features/canvas/editor/nodeFactory'

export function useCanvasWorkflowReferenceNodeActions({
  canvasCoordinateSpace,
  canvasId,
  setNodes,
  t,
}: {
  canvasCoordinateSpace: CanvasFlowCoordinateSpace
  canvasId: string
  setNodes: Dispatch<SetStateAction<Node[]>>
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  const addWorkflowReferenceNodeAt = useCallback(async (workflowCanvas: Canvas, clientPosition: CanvasClientPoint) => {
    if (String(workflowCanvas.ID) === canvasId) {
      toast.error(t('canvas.editor.errors.selfReferenceWorkflow', { defaultValue: 'A canvas cannot reference itself.' }))
      return
    }
    try {
      const referencedCanvas = workflowCanvas.nodes
        ? workflowCanvas
        : await api.get(`/canvases/${workflowCanvas.ID}`).then((response) => response.data as Canvas)
      if ((referencedCanvas.canvas_type ?? 'inspiration') !== 'workflow') return
      const position = canvasCoordinateSpace.fromClient(clientPosition)
      const newNode = createWorkflowReferenceCanvasNode({ workflowCanvas: referencedCanvas, position, t })
      setNodes((prev) => [...prev, newNode])
    } catch (error: any) {
      toast.error(error?.response?.data?.error || error?.message || t('canvas.editor.errors.workflowReferenceFailed', { defaultValue: 'Failed to add workflow reference.' }))
    }
  }, [canvasCoordinateSpace, canvasId, setNodes, t])

  return { addWorkflowReferenceNodeAt }
}
