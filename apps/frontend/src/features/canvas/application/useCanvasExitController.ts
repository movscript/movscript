import { useCallback } from 'react'
import type { Edge, Node } from '@xyflow/react'
import type { TFunction } from 'i18next'

import { useCanvasBeforeUnloadGuard } from '@/features/canvas/application/useCanvasBrowserGuards'
import { toast } from '@/shared/ui/toastStore'

export function useCanvasExitController({
  edges,
  hasUnsavedChanges,
  nodes,
  persistCanvasGraph,
  runningCount,
  runtimeStarting,
  savingCanvas,
  setAutoSaveState,
  t,
}: {
  edges: Edge[]
  hasUnsavedChanges: boolean
  nodes: Node[]
  persistCanvasGraph: (nextNodes: Node[], nextEdges: Edge[]) => Promise<void>
  runningCount: number
  runtimeStarting: boolean
  savingCanvas: boolean
  setAutoSaveState: (state: 'idle' | 'saving' | 'saved' | 'error') => void
  t: TFunction
}) {
  const shouldBlockCanvasExit = hasUnsavedChanges || savingCanvas || runtimeStarting || runningCount > 0
  useCanvasBeforeUnloadGuard(shouldBlockCanvasExit)

  return useCallback(async (leave: () => void) => {
    if (runningCount > 0 || runtimeStarting) {
      const ok = window.confirm(t('canvas.editor.leaveWhileRunningConfirm', {
        defaultValue: '画布仍在运行中。现在退出可能导致本次运行结果无法写回节点。确定要退出吗？',
      }))
      if (!ok) return
    }
    if (hasUnsavedChanges || savingCanvas) {
      const ok = window.confirm(t('canvas.editor.saveBeforeLeaveConfirm', {
        defaultValue: '画布有未保存改动。是否先保存再退出？',
      }))
      if (!ok) return
      try {
        setAutoSaveState('saving')
        await persistCanvasGraph(nodes, edges)
      } catch (err: any) {
        setAutoSaveState('error')
        toast.error(err?.response?.data?.error || err?.message || t('canvas.editor.autoSaveFailed', { defaultValue: '自动保存失败' }))
        return
      }
    }
    leave()
  }, [edges, hasUnsavedChanges, nodes, persistCanvasGraph, runningCount, runtimeStarting, savingCanvas, setAutoSaveState, t])
}
