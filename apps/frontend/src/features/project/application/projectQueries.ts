import type { QueryClient } from '@tanstack/react-query'

export const projectKeys = {
  all: ['projects'] as const,
  list: (orgId: number | null | undefined) => ['projects', orgId ?? 'none'] as const,
  detail: (projectId: number | undefined) => ['project', projectId] as const,
  progressAll: ['progress'] as const,
  progress: (orgId: number | null | undefined, projectId: number) => ['progress', orgId ?? 'none', projectId] as const,
}

export function removeProjectCaches(queryClient: QueryClient): void {
  void queryClient.removeQueries({ queryKey: projectKeys.all })
  void queryClient.removeQueries({ queryKey: projectKeys.progressAll })
}
