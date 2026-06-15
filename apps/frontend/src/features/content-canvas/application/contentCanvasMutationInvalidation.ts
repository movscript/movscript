import type { QueryClient } from '@tanstack/react-query'

import { contentCanvasKeys } from './contentCanvasQueryKeys'

export function invalidateContentCanvasProject(queryClient: QueryClient, projectId: number | undefined): Promise<void> {
  if (!projectId) return Promise.resolve()
  return queryClient.invalidateQueries({ queryKey: contentCanvasKeys.project(projectId) }).then(() => undefined)
}
