export const contentCanvasKeys = {
  project: (projectId: number | undefined) => ['content-canvas', 'project', projectId] as const,
}
