export const projectStandardsKeys = {
  workspaceArtifacts: (
    projectId: number | undefined,
    pageKey: string | undefined,
    activeWorkspaceId: string | null | undefined,
    openedWorkspaceId: string | null | undefined,
  ) => ['project-workspace-artifacts', projectId, pageKey, activeWorkspaceId, openedWorkspaceId] as const,
}
