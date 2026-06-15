import type { QueryClient } from '@tanstack/react-query'

export const projectKeys = {
  all: ['projects'] as const,
  list: (orgId: number | null | undefined) => ['projects', orgId ?? 'none'] as const,
  detail: (projectId: number | undefined) => ['project', projectId] as const,
  progressAll: ['progress'] as const,
  progress: (orgId: number | null | undefined, projectId: number) => ['progress', orgId ?? 'none', projectId] as const,
}

export const projectOverviewKeys = {
  detail: (projectId: number | undefined) => ['project-page', projectId] as const,
  workspaceRoot: ['project-page-workspace-root'] as const,
  plugins: (workspaceDir: string | undefined, projectId: string | number | undefined) => ['project-page-plugins', workspaceDir, projectId] as const,
  observedSkills: (projectCwd: string | undefined, enabledSkillCount: number | undefined) => ['project-page-observed-skills', projectCwd, enabledSkillCount] as const,
  pluginMarketplace: ['project-page-plugin-marketplace'] as const,
}

export function removeProjectCaches(queryClient: QueryClient): void {
  void queryClient.removeQueries({ queryKey: projectKeys.all })
  void queryClient.removeQueries({ queryKey: projectKeys.progressAll })
}
