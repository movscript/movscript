import type { Dispatch, SetStateAction } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Edge, Node } from '@xyflow/react'
import type { TFunction } from 'i18next'
import { canvasKeys } from './canvasQueryKeys'
import { canvasApi, canvasServicePaths } from './canvasServiceApi'
import { useCanvasRenameController } from './useCanvasRenameController'
import { useCanvasDocument } from '../editor/useCanvasDocument'
import type { Canvas, CanvasType } from '@movscript/shared'

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
    queryFn: () => canvasApi.get(canvasServicePaths.canvas(canvasId)).then((r) => r.data),
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
