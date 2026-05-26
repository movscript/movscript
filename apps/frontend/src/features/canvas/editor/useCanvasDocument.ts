import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Edge, Node } from '@xyflow/react'
import { api } from '@/shared/infrastructure/api'
import type { Canvas, CanvasNodeData, CanvasType } from '@/types'
import { toast } from '@/shared/ui/toastStore'
import { canvasGraphSignature } from '@/features/canvas/domain/serialization'
import { buildCanvasSavePayload, hydrateCanvasDocument } from './canvasDocument'

interface UseCanvasDocumentInput {
  canvasId: string
  canvas: Canvas | undefined
  canvasName: string
  canvasType: CanvasType
  nodes: Node[]
  edges: Edge[]
  runtimeStarting: boolean
  setCanvasName: Dispatch<SetStateAction<string>>
  setCanvasType: Dispatch<SetStateAction<CanvasType>>
  setNodes: Dispatch<SetStateAction<Node[]>>
  setEdges: Dispatch<SetStateAction<Edge[]>>
  fitView: (options: { padding: number; duration: number }) => unknown
  t: (key: string, options?: any) => string
}

export function useCanvasDocument({
  canvasId,
  canvas,
  canvasName,
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
}: UseCanvasDocumentInput) {
  const qc = useQueryClient()
  const fitViewCalledRef = useRef(false)
  const hydratingCanvasRef = useRef(false)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedSignatureRef = useRef('')
  const latestGraphSignatureRef = useRef('')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [autoSaveState, setAutoSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    if (!canvas) return
    setCanvasName(canvas.name)
    setCanvasType(canvas.canvas_type ?? 'inspiration')
    const {
      nodes: nextNodes,
      edges: loadedEdges,
      signature: loadedSignature,
    } = hydrateCanvasDocument(canvas, t)
    hydratingCanvasRef.current = true
    lastSavedSignatureRef.current = loadedSignature
    latestGraphSignatureRef.current = loadedSignature
    setHasUnsavedChanges(false)
    setAutoSaveState('idle')
    setNodes(nextNodes)
    setEdges(loadedEdges)
    window.setTimeout(() => {
      hydratingCanvasRef.current = false
    }, 0)

    if (!fitViewCalledRef.current && nextNodes.length > 0) {
      fitViewCalledRef.current = true
      setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 80)
    }
  }, [canvas, fitView, setCanvasName, setCanvasType, setEdges, setNodes, t])

  const persistCanvasGraph = useCallback(async (nextNodes: Node[], nextEdges: Edge[]) => {
    const savedSignature = canvasGraphSignature({
      canvasName,
      canvasType,
      nodes: nextNodes,
      edges: nextEdges,
      t,
    })
    const payload = await buildCanvasSavePayload({
      canvasName,
      canvasType,
      nodes: nextNodes,
      edges: nextEdges,
      t,
    })
    await api.put(`/canvases/${canvasId}`, payload)
    lastSavedSignatureRef.current = savedSignature
    setHasUnsavedChanges(latestGraphSignatureRef.current !== savedSignature)
    setAutoSaveState('saved')
    qc.invalidateQueries({ queryKey: ['canvas', canvasId] })
  }, [canvasId, canvasName, canvasType, qc, t])

  const save = useMutation({
    mutationFn: () => persistCanvasGraph(nodes, edges),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['canvas', canvasId] }),
  })

  useEffect(() => {
    if (!canvas || hydratingCanvasRef.current) return
    const signature = canvasGraphSignature({ canvasName, canvasType, nodes, edges, t })
    latestGraphSignatureRef.current = signature
    const dirty = signature !== lastSavedSignatureRef.current
    setHasUnsavedChanges(dirty)
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }
    if (!dirty) return

    const runtimeActive = runtimeStarting || nodes.some((node) => {
      const status = (node.data as Partial<CanvasNodeData>).status
      return status === 'running' || status === 'pending'
    })
    if (runtimeActive) return

    autoSaveTimerRef.current = setTimeout(() => {
      setAutoSaveState('saving')
      void persistCanvasGraph(nodes, edges).catch((err: any) => {
        setAutoSaveState('error')
        toast.error(err?.response?.data?.error || err?.message || t('canvas.editor.autoSaveFailed', { defaultValue: '自动保存失败' }))
      })
    }, 1500)

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
        autoSaveTimerRef.current = null
      }
    }
  }, [canvas, canvasName, canvasType, edges, nodes, persistCanvasGraph, runtimeStarting, t])

  return {
    hasUnsavedChanges,
    autoSaveState,
    setAutoSaveState,
    persistCanvasGraph,
    save,
  }
}
