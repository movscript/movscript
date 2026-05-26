export interface AssetCandidateQueryInvalidator {
  invalidateQueries: (options: { queryKey: unknown[] }) => unknown
}

export function invalidateAssetCandidateConsumers(queryClient: AssetCandidateQueryInvalidator, projectId?: number) {
  if (!projectId) return
  const queryKeys: unknown[][] = [
    ['work-targets', projectId, 'asset-slots'],
    ['work-targets', projectId, 'asset-slot-candidates'],
    ['work-targets', projectId, 'keyframes'],
    ['semantic-asset-slot-candidates-page', projectId],
    ['semantic-asset-slots-page', projectId],
    ['semantic-keyframes-page', projectId],
    ['semantic-candidate-decisions-page', projectId],
    ['semantic-review-events-page', projectId],
    ['semantic-content-positioning', projectId, 'keyframes'],
    ['semantic-content-positioning', projectId],
    ['semantic-scene-moment-page', projectId],
    ['semantic-segment-workspace', projectId],
    ['project-overview', projectId],
    ['project-workspace', projectId],
    ['production-frame', projectId],
    ['workbench', 'assets', projectId],
    ['workbench', 'production', projectId],
  ]
  for (const queryKey of queryKeys) {
    void queryClient.invalidateQueries({ queryKey })
  }
}
