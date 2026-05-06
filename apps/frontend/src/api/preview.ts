import { api } from '@/lib/api'

export type PreviewScope = 'segment' | 'scene_moment' | 'content_unit'

export type PreviewEntitySummary = {
  id: number
  title: string
  description: string
}

export type PreviewContext = {
  segment_title?: string
  scene_moment_title?: string
}

export type PreviewContentUnit = {
  id: number
  order: number
  title: string
  kind: string
  description: string
  duration_sec: number
}

export type PreviewKeyframe = {
  id: number
  content_unit_id?: number | null
  order: number
  title: string
  description: string
  prompt: string
  resource_id?: number | null
  resource_url?: string
  has_asset: boolean
}

export type PreviewMissingAsset = {
  id: number
  name: string
  description: string
  kind: string
  priority: string
}

export type PreviewGenerateResponse = {
  scope: PreviewScope
  entity: PreviewEntitySummary
  context: PreviewContext
  content_units: PreviewContentUnit[]
  keyframes: PreviewKeyframe[]
  missing_assets: PreviewMissingAsset[]
  generated_at: string
}

export async function generatePreview(
  projectId: number,
  scope: PreviewScope,
  entityId: number,
): Promise<PreviewGenerateResponse> {
  const res = await api.post<PreviewGenerateResponse>(`/projects/${projectId}/preview/generate`, {
    scope,
    entity_id: entityId,
  })
  return res.data
}
