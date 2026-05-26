import { attachAssetSlotCandidate, attachKeyframeCandidate } from '../candidateAttach'
import { getOptionalNumeric } from '../generationConnectors/params'

export async function attachImportedOutputCandidates(outputResourceIds: number[], args: Record<string, unknown>, sourceType: string): Promise<unknown[]> {
  if (outputResourceIds.length === 0) return []
  const projectId = getOptionalNumeric(args, 'projectId') ?? getOptionalNumeric(args, 'project_id')
  if (!projectId) return []
  const assetSlotId = getOptionalNumeric(args, 'asset_slot_id') ?? getOptionalNumeric(args, 'assetSlotId')
  const keyframeId = getOptionalNumeric(args, 'keyframe_id') ?? getOptionalNumeric(args, 'keyframeId')
  const results: unknown[] = []
  if (assetSlotId) {
    results.push(await attachAssetSlotCandidate({ projectId, asset_slot_id: assetSlotId, output_resource_ids: outputResourceIds, source_type: sourceType }))
  }
  if (keyframeId) {
    results.push(await attachKeyframeCandidate({ projectId, keyframe_id: keyframeId, output_resource_ids: outputResourceIds, source_type: sourceType }))
  }
  return results
}
