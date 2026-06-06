interface PreProductionRefreshQueryClient {
  invalidateQueries: (input: { queryKey: unknown[] }) => Promise<unknown>
}

interface RefreshPreProductionWorkbenchContextInput {
  projectId?: number
  queryClient: PreProductionRefreshQueryClient
  refetchSettingWorkspaceArtifacts?: () => Promise<unknown>
  refetchAssetWorkspaceArtifacts?: () => Promise<unknown>
  /** @deprecated Use refetchSettingWorkspaceArtifacts. */
  refetchSettingWorkspaces?: () => Promise<unknown>
  /** @deprecated Use refetchAssetWorkspaceArtifacts. */
  refetchAssetWorkspaceWorkspaces?: () => Promise<unknown>
}

export async function refreshPreProductionWorkbenchContext({
  projectId,
  queryClient,
  refetchSettingWorkspaceArtifacts,
  refetchAssetWorkspaceArtifacts,
  refetchSettingWorkspaces,
  refetchAssetWorkspaceWorkspaces,
}: RefreshPreProductionWorkbenchContextInput) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['pre-production-settings', projectId] }),
    queryClient.invalidateQueries({ queryKey: ['semantic-asset-slots-page', projectId] }),
    queryClient.invalidateQueries({ queryKey: ['semantic-asset-slot-candidates-page', projectId] }),
    (refetchSettingWorkspaceArtifacts ?? refetchSettingWorkspaces)?.(),
    (refetchAssetWorkspaceArtifacts ?? refetchAssetWorkspaceWorkspaces)?.(),
  ])
}
