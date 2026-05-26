import { backendPost } from '../backendClient'
import { getRequiredPositiveIntegerAliasParam } from './candidateParams'
import { stringValue } from '../generation'
import { isRecord } from '../valueUtils'
import {
  existingKeyframeCandidateResourceIds,
  isGeneratedKeyframeCandidateTarget,
} from './keyframeRecords'
import { getRequiredCandidateResourceIds, resolveCandidateAttachSource } from './params'
import {
  backendList,
  entityId,
  getOptionalString,
  numericValue,
  resolveToolProjectId,
  resourceAttachMessage,
} from './utils'

export async function attachKeyframeCandidate(args: Record<string, unknown>): Promise<unknown> {
  const projectId = resolveToolProjectId(args)
  const keyframeIdAliases = ['keyframe_id', 'keyframeId', 'target_keyframe_id', 'targetKeyframeId']
  const keyframeId = getRequiredPositiveIntegerAliasParam(args, keyframeIdAliases, 'keyframe_id')
  const resourceIds = getRequiredCandidateResourceIds(args)

  const keyframes = await backendList(`/projects/${projectId}/entities/keyframes`)
  const target = keyframes.find((item) => entityId(item) === keyframeId)
  if (!target || !isRecord(target)) throw new Error(`target keyframe ${keyframeId} not found in project ${projectId}`)
  if (isGeneratedKeyframeCandidateTarget(target)) {
    throw new Error(`keyframe ${keyframeId} is already a generated candidate; choose the original target keyframe`)
  }
  const existingResourceIds = existingKeyframeCandidateResourceIds(keyframes, keyframeId)
  const resourceIdsToAttach = resourceIds.filter((resourceId) => !existingResourceIds.has(resourceId))
  const skippedResourceIds = resourceIds.filter((resourceId) => existingResourceIds.has(resourceId))

  const source = resolveCandidateAttachSource(args, { includeSourceJobId: true })
  const explicitTitle = getOptionalString(args, 'title')
  const explicitDescription = getOptionalString(args, 'description')
  const explicitPrompt = getOptionalString(args, 'prompt')
  const note = getOptionalString(args, 'note')
  const targetTitle = stringValue(target.title) ?? stringValue(target.name) ?? `画面锚点 #${keyframeId}`
  const targetDescription = stringValue(target.description)
  const targetPrompt = stringValue(target.prompt)
  const candidates = []
  for (const resourceId of resourceIdsToAttach) {
    const metadata: Record<string, unknown> = {
      source: 'ai_generated_keyframe_candidate',
      target_keyframe_id: keyframeId,
      resource_id: resourceId,
      source_type: source.sourceType,
      ...(source.sourceId ? { source_id: source.sourceId } : {}),
      ...(source.sourceJobId ? { source_job_id: source.sourceJobId } : {}),
      ...(note ? { note } : {}),
    }
    candidates.push(await backendPost(`/projects/${projectId}/entities/keyframes`, {
      production_id: numericValue(target.production_id ?? target.productionId),
      scene_moment_id: numericValue(target.scene_moment_id ?? target.sceneMomentId),
      content_unit_id: numericValue(target.content_unit_id ?? target.contentUnitId),
      resource_id: resourceId,
      canvas_id: numericValue(target.canvas_id ?? target.canvasId),
      title: explicitTitle ?? `候选：${targetTitle}`,
      description: explicitDescription ?? targetDescription ?? '',
      prompt: explicitPrompt ?? targetPrompt ?? '',
      order: numericValue(target.order ?? target.sort_order ?? target.sortOrder) ?? 0,
      status: 'candidate',
      metadata_json: JSON.stringify(metadata),
    }))
  }
  const candidate = candidates[0]
  const resourceId = resourceIdsToAttach[0] ?? resourceIds[0]

  return {
    status: 'attached',
    candidate: candidate ?? {},
    candidates,
    keyframe_id: keyframeId,
    resource_id: resourceId,
    resource_ids: resourceIds,
    ...(skippedResourceIds.length > 0 ? { skipped_resource_ids: skippedResourceIds } : {}),
    message: resourceAttachMessage({
      resourceIds,
      attachedResourceIds: resourceIdsToAttach,
      skippedResourceIds,
      targetLabel: `画面锚点 #${keyframeId}`,
    }),
  }
}
