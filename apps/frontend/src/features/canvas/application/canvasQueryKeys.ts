export const canvasKeys = {
  all: ['canvases'] as const,
  list: (projectId?: number | null) => ['canvases', projectId ?? undefined] as const,
  detail: (canvasId: number | string) => ['canvas', canvasId] as const,
  referenceWorkflows: (projectId?: number | null) => ['canvas-reference-workflows', projectId] as const,
  workbench: (projectId: number | undefined, stage: string | undefined) => ['workbench-canvas', projectId, stage] as const,
}
