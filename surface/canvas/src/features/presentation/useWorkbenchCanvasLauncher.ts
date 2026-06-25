import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { canvasKeys } from '../application/canvasQueryKeys'
import { canvasApi, canvasServicePaths } from '../application/canvasServiceApi'
import { canvasEditorSurfacePath, type Canvas, type CanvasStage } from '@movscript/shared'
import { useSurfaceHostState } from '../application/surfaceHostStateHooks'

export type CanvasWorkbenchKind = 'assets' | 'production'

const canvasWorkbenchMeta: Record<CanvasWorkbenchKind, { stage: CanvasStage; canvasName: string }> = {
  assets: {
    stage: 'asset_prep',
    canvasName: '素材工作台画布',
  },
  production: {
    stage: 'generation',
    canvasName: '创作画布',
  },
}

export function useWorkbenchCanvasLauncher(kind?: CanvasWorkbenchKind) {
  const navigate = useNavigate()
  const project = useSurfaceHostState((state) => state.currentProject)
  const meta = kind ? canvasWorkbenchMeta[kind] : undefined
  const canvasesQuery = useQuery<Canvas[]>({
    queryKey: canvasKeys.workbench(meta?.stage),
    queryFn: () => canvasApi.get(canvasServicePaths.canvases, {
      params: {
        stage: meta?.stage,
        type: 'workflow',
      },
    }).then((r) => r.data),
    enabled: !!project?.ID && !!meta,
  })
  const createCanvas = useMutation({
    mutationFn: () => {
      if (!project?.ID || !meta) throw new Error('请先选择项目')
      return canvasApi.post(canvasServicePaths.canvases, {
        name: meta.canvasName,
        canvas_type: 'workflow',
        stage: meta.stage,
      }).then((r) => r.data as Canvas)
    },
    onSuccess: (canvas) => navigate(canvasEditorSurfacePath(canvas.ID, { source: 'project' })),
  })
  const existingCanvas = canvasesQuery.data?.[0]
  return {
    disabled: !project?.ID || canvasesQuery.isLoading || createCanvas.isPending || !meta,
    loading: canvasesQuery.isLoading || createCanvas.isPending,
    label: createCanvas.isPending ? '创建中' : existingCanvas ? '打开生成画布' : '创建生成画布',
    open: () => {
      if (!meta) return
      if (existingCanvas) {
        navigate(canvasEditorSurfacePath(existingCanvas.ID, { source: 'project' }))
        return
      }
      createCanvas.mutate()
    },
  }
}
