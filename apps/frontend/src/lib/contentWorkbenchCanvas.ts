export interface ContentWorkbenchCanvasRef {
  ID: number
  canvas_type?: string
  stage?: string
  ref_type?: string
  ref_id?: number
}

export interface ContentWorkbenchCanvasPayload {
  name: string
  description?: string
  project_id: number
  canvas_type: 'workflow'
  stage: 'generation'
  ref_type: 'content_unit'
  ref_id: number
}

export function findContentWorkbenchCanvas<T extends ContentWorkbenchCanvasRef>(canvases: T[], contentUnitId: number): T | undefined {
  return canvases.find((canvas) => (
    canvas.canvas_type === 'workflow' &&
    canvas.stage === 'generation' &&
    canvas.ref_type === 'content_unit' &&
    Number(canvas.ref_id) === contentUnitId
  ))
}

export function buildContentWorkbenchCanvasPayload(input: {
  projectId: number
  contentUnitId: number
  title: string
  description?: string
}): ContentWorkbenchCanvasPayload {
  return {
    name: `${input.title} · 内容编排`,
    description: input.description,
    project_id: input.projectId,
    canvas_type: 'workflow',
    stage: 'generation',
    ref_type: 'content_unit',
    ref_id: input.contentUnitId,
  }
}
