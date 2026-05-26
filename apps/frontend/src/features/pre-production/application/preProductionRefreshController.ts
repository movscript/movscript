interface PreProductionRefreshQueryClient {
  invalidateQueries: (input: { queryKey: unknown[] }) => Promise<unknown>
}

interface RefreshPreProductionWorkbenchContextInput {
  projectId?: number
  queryClient: PreProductionRefreshQueryClient
  refetchSettingDrafts?: () => Promise<unknown>
  refetchAssetProposalDrafts?: () => Promise<unknown>
}

export async function refreshPreProductionWorkbenchContext({
  projectId,
  queryClient,
  refetchSettingDrafts,
  refetchAssetProposalDrafts,
}: RefreshPreProductionWorkbenchContextInput) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['pre-production-creative-references', projectId] }),
    queryClient.invalidateQueries({ queryKey: ['semantic-asset-slots-page', projectId] }),
    queryClient.invalidateQueries({ queryKey: ['semantic-asset-slot-candidates-page', projectId] }),
    refetchSettingDrafts?.(),
    refetchAssetProposalDrafts?.(),
  ])
}
