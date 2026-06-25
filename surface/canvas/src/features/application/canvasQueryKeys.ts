export const canvasKeys = {
  all: ['canvases'] as const,
  list: () => ['canvases'] as const,
  detail: (canvasId: number | string) => ['canvas', canvasId] as const,
  referenceWorkflows: () => ['canvas-reference-workflows'] as const,
  workbench: (stage: string | undefined) => ['workbench-canvas', stage] as const,
}
