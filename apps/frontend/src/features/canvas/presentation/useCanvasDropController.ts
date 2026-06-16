import { useCallback, useState, type Dispatch, type DragEvent, type RefObject, type SetStateAction } from 'react'
import type { Node } from '@xyflow/react'
import type { TFunction } from 'i18next'

import type { Canvas, NodeType, RawResource } from '@/types'
import { CANVAS_NODE_META } from '@/features/canvas/presentation/nodeCatalog'
import type { CanvasClientPoint, CanvasFlowCoordinateSpace } from '@/features/canvas/domain/layout'
import {
  acceptCanvasDropDragOver,
  readCanvasDropPayload,
} from '@/features/canvas/domain/canvasDropTarget'
import {
  fileToCanvasResourceNodeType,
  resourceToNodeType,
  uploadCanvasResourceFile,
} from '@/features/canvas/integrations/resources'
import { createResourceCanvasNode } from '@/features/canvas/editor/nodeFactory'
import {
  canvasClientPointFromEvent,
  canvasViewportDropHitBoxFromEvent,
} from '@/features/canvas/presentation/canvasViewportGeometry'
import { toast } from '@/shared/ui/toastStore'

export function useCanvasDropController({
  addNodeAt,
  addWorkflowReferenceNodeAt,
  canvasCoordinateSpace,
  canvasPaneRef,
  setNodes,
  t,
}: {
  addNodeAt: (type: NodeType, clientPosition?: CanvasClientPoint) => void
  addWorkflowReferenceNodeAt: (workflowCanvas: Canvas, clientPosition: CanvasClientPoint) => Promise<void>
  canvasCoordinateSpace: CanvasFlowCoordinateSpace
  canvasPaneRef: RefObject<HTMLDivElement>
  setNodes: Dispatch<SetStateAction<Node[]>>
  t: TFunction
}) {
  const [dropActive, setDropActive] = useState(false)

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

  const onDrop = useCallback((event: DragEvent) => {
    event.preventDefault()
    setDropActive(false)
    const clientPoint = canvasClientPointFromEvent(event)
    const payload = readCanvasDropPayload(event.dataTransfer, {
      isNodeTypeAllowed: (nodeType) => Boolean(CANVAS_NODE_META[nodeType]),
    })
    if (!payload) return
    const hitBox = canvasViewportDropHitBoxFromEvent({ event, viewport: canvasPaneRef.current, payload })
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
  }, [addNodeAt, addResourceNodeAt, addWorkflowReferenceNodeAt, canvasPaneRef, uploadDroppedFilesToCanvas])

  const onDragOver = useCallback((event: DragEvent) => {
    const hitBox = canvasViewportDropHitBoxFromEvent({ event, viewport: canvasPaneRef.current })
    if (!acceptCanvasDropDragOver({ dataTransfer: event.dataTransfer, hitBox })) return
    event.preventDefault()
    setDropActive(true)
  }, [canvasPaneRef])

  const onDragLeave = useCallback((event: DragEvent) => {
    if (event.currentTarget === event.target) setDropActive(false)
  }, [])

  return {
    dropActive,
    onDragLeave,
    onDragOver,
    onDrop,
  }
}
