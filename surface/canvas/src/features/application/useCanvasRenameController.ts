import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'

import {
  canvasListChangedResult,
  commitCanvasRenameMutation,
  invalidateCanvasMutationResult,
  prepareCanvasRenameMutation,
  restoreCanvasRenameMutation,
} from './canvasMutationInvalidation'
import { canvasApi, canvasServicePaths } from './canvasServiceApi'
import { toast } from '@movscript/ui/toast'
import type { Canvas } from '@movscript/shared'

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
    mutationFn: (name: string) => canvasApi.patch(canvasServicePaths.canvas(id), { name }).then((response) => response.data as Canvas),
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
