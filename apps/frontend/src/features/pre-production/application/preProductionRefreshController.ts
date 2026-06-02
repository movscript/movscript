interface PreProductionRefreshQueryClient {
  invalidateQueries: (input: { queryKey: unknown[] }) => Promise<unknown>
}

interface RefreshPreProductionWorkbenchContextInput {
  projectId?: number
  queryClient: PreProductionRefreshQueryClient
  refetchSettingWorkspaces?: () => Promise<unknown>
  refetchAssetWorkspaceWorkspaces?: () => Promise<unknown>
}

export async function refreshPreProductionWorkbenchContext({
  projectId,
  queryClient,
  refetchSettingWorkspaces,
  refetchAssetWorkspaceWorkspaces,
}: RefreshPreProductionWorkbenchContextInput) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['pre-production-creative-references', projectId] }),
    queryClient.invalidateQueries({ queryKey: ['semantic-asset-slots-page', projectId] }),
    queryClient.invalidateQueries({ queryKey: ['semantic-asset-slot-candidates-page', projectId] }),
    refetchSettingWorkspaces?.(),
    refetchAssetWorkspaceWorkspaces?.(),
  ])
}
