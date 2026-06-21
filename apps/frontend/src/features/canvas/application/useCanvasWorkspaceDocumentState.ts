import type { Dispatch, SetStateAction } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Edge, Node } from '@xyflow/react'
import type { TFunction } from 'i18next'
import { api } from '@/shared/infrastructure/api'
import { canvasKeys } from '@/features/canvas/application/canvasQueryKeys'
import { useCanvasRenameController } from '@/features/canvas/application/useCanvasRenameController'
import { useCanvasDocument } from '@/features/canvas/editor/useCanvasDocument'
import type { Canvas, CanvasType } from '@/types'

export function useCanvasWorkspaceDocumentState({
  canvasId,
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
}: {
  canvasId: string
  canvasType: CanvasType
  edges: Edge[]
  fitView: (options: { padding: number; duration: number }) => unknown
  nodes: Node[]
  runtimeStarting: boolean
  setCanvasName: Dispatch<SetStateAction<string>>
  setCanvasType: Dispatch<SetStateAction<CanvasType>>
  setEdges: Dispatch<SetStateAction<Edge[]>>
  setNodes: Dispatch<SetStateAction<Node[]>>
  t: TFunction
}) {
  const { data: canvas } = useQuery<Canvas>({
    queryKey: canvasKeys.detail(canvasId),
    queryFn: () => api.get(`/canvases/${canvasId}`).then((r) => r.data),
    enabled: !!canvasId,
  })
  const renameCanvas = useCanvasRenameController({
    canvasId,
    setCanvasName,
    t,
  })
  const documentState = useCanvasDocument({
    canvasId,
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

  return {
    canvas,
    renameCanvas,
    ...documentState,
  }
}
