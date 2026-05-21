import { api } from '@/lib/api'
import {
  buildContentWorkbenchCanvasPayload,
  findContentWorkbenchCanvas,
  type ContentWorkbenchCanvasPayload,
} from '@/lib/contentWorkbenchCanvas'
import { contentUnitGenerationCanvasDescription, type ContentUnitPlanningRecord } from '@/lib/contentUnitPlanningMetadata'
import { titleOfRecord, type OrderedWorkbenchRecord } from '@/lib/contentWorkbenchRecordUtils'
import type { Canvas } from '@/types'

export interface ContentWorkbenchCanvasQueryParams {
  project_id: number
  type: 'workflow'
  stage: 'generation'
  ref_type: 'content_unit'
  ref_id: number
}

export type ContentWorkbenchCanvasUnit = OrderedWorkbenchRecord & ContentUnitPlanningRecord & {
  ID: number
}

export interface ContentWorkbenchCanvasLaunchClient {
  get(url: string, config?: { params?: ContentWorkbenchCanvasQueryParams }): Promise<{ data: Canvas[] }>
  post(url: string, payload: ContentWorkbenchCanvasPayload): Promise<{ data: Canvas }>
}

export function buildContentWorkbenchCanvasQueryParams(input: {
  projectId: number
  contentUnitId: number
}): ContentWorkbenchCanvasQueryParams {
  return {
    project_id: input.projectId,
    type: 'workflow',
    stage: 'generation',
    ref_type: 'content_unit',
    ref_id: input.contentUnitId,
  }
}

export function contentWorkbenchCanvasRoute(canvas: Pick<Canvas, 'ID'>) {
  return `/canvases/${canvas.ID}`
}

export async function openContentWorkbenchUnitCanvas(input: {
  projectId: number
  unit: ContentWorkbenchCanvasUnit
  client?: ContentWorkbenchCanvasLaunchClient
}): Promise<Canvas> {
  const client = input.client ?? api
  const canvases = await client.get('/canvases', {
    params: buildContentWorkbenchCanvasQueryParams({
      projectId: input.projectId,
      contentUnitId: input.unit.ID,
    }),
  }).then((r) => r.data as Canvas[])
  const existingCanvas = findContentWorkbenchCanvas(canvases, input.unit.ID)
  if (existingCanvas) return existingCanvas
  return client.post('/canvases', buildContentWorkbenchCanvasPayload({
    projectId: input.projectId,
    contentUnitId: input.unit.ID,
    title: titleOfRecord(input.unit),
    description: contentUnitGenerationCanvasDescription(input.unit),
  })).then((r) => r.data as Canvas)
}
