import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'

import {
  canvasListChangedResult,
  commitCanvasRenameMutation,
  invalidateCanvasMutationResult,
  prepareCanvasRenameMutation,
  restoreCanvasRenameMutation,
} from '@/features/canvas/application/canvasMutationInvalidation'
import { api } from '@/shared/infrastructure/api'
import { toast } from '@/shared/ui/toastStore'
import type { Canvas } from '@/types'

export function useCanvasRenameController({
  canvasId,
  setCanvasName,
  t,
}: {
  canvasId: number | string
  setCanvasName: (name: string) => void
  t: TFunction
}) {
  const queryClient = useQueryClient()
  const id = String(canvasId)

  return useMutation({
    mutationFn: (name: string) => api.patch(`/canvases/${id}`, { name }).then((response) => response.data as Canvas),
    onMutate: async (name) => {
      const nextName = name.trim()
      const context = await prepareCanvasRenameMutation(queryClient, id, name)
      setCanvasName(nextName)
      return context
    },
    onError: (err: any, _name, context) => {
      const previousCanvas = restoreCanvasRenameMutation(queryClient, id, context)
      if (previousCanvas) setCanvasName(previousCanvas.name)
      toast.error(err?.response?.data?.error || err?.message || t('canvas.editor.renameFailed', { defaultValue: '重命名失败' }))
    },
    onSuccess: (nextCanvas) => {
      commitCanvasRenameMutation(queryClient, id, nextCanvas)
    },
    onSettled: () => {
      invalidateCanvasMutationResult(queryClient, canvasListChangedResult({ changedIds: [id] }))
    },
  })
}
