import { api } from '@/lib/api'
import type { Canvas } from '@/types'

export interface PreProductionCanvasPayload {
  name: string
  project_id: number
  canvas_type: 'inspiration'
  stage: 'asset_prep'
  ref_type: 'asset_slot'
  ref_id: number
}

export interface PreProductionAssetSlotCanvasTarget {
  ID: number
  name?: string
}

export interface PreProductionCanvasLaunchClient {
  post(url: string, payload: PreProductionCanvasPayload): Promise<{ data: Canvas }>
}

export function buildPreProductionAssetSlotCanvasPayload(input: {
  projectId: number
  slot: PreProductionAssetSlotCanvasTarget
}): PreProductionCanvasPayload {
  return {
    name: `${input.slot.name || `素材需求 #${input.slot.ID}`} · 素材准备画布`,
    project_id: input.projectId,
    canvas_type: 'inspiration',
    stage: 'asset_prep',
    ref_type: 'asset_slot',
    ref_id: input.slot.ID,
  }
}

export async function createPreProductionAssetSlotCanvas(input: {
  projectId: number
  slot: PreProductionAssetSlotCanvasTarget
  client?: PreProductionCanvasLaunchClient
}): Promise<Canvas> {
  const client = input.client ?? api
  return client.post('/canvases', buildPreProductionAssetSlotCanvasPayload({
    projectId: input.projectId,
    slot: input.slot,
  })).then((r) => r.data as Canvas)
}

export function preProductionCanvasRoute(canvas: Pick<Canvas, 'ID'>) {
  return `/canvases/${canvas.ID}`
}

export function buildPreProductionAssetSlotCanvasMutationOptions(input: {
  projectId?: number
  navigateToCanvas: (path: string) => void
  client?: PreProductionCanvasLaunchClient
}) {
  return {
    mutationFn: async (slot: PreProductionAssetSlotCanvasTarget) => {
      if (!input.projectId) throw new Error('请先选择项目')
      return createPreProductionAssetSlotCanvas({ projectId: input.projectId, slot, client: input.client })
    },
    onSuccess: (canvas: Canvas) => {
      input.navigateToCanvas(preProductionCanvasRoute(canvas))
    },
  }
}
