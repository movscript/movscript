export const contentCanvasKeys = {
  projectScope: (projectId: number | undefined) => ['content-canvas', 'project', projectId] as const,
  project: (projectId: number | undefined, projectDir?: string | null) => ['content-canvas', 'project', projectId, projectDir ?? null] as const,
}
