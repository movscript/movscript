import type { MCPTool } from '../types'
import { objectSchema, withCandidateAttachAliasRequirements } from './schema'

export function candidateAttachmentTools(): MCPTool[] {
  return [
    {
      name: 'candidate_asset_slot_attach',
      description: 'Add one existing raw resource to the reviewable candidate set for an asset slot. Use after generation succeeds and an output_resource_id is available. Agent automation should call this once per resource as soon as that resource is available; array aliases are compatibility-only. This creates or reuses the candidate asset slot and candidate relation, but does not accept, select, bind, or lock the candidate.',
      inputSchema: withCandidateAttachAliasRequirements(objectSchema(
        {
          projectId: { type: 'number', description: 'Defaults to the current UI project when omitted.' },
          asset_slot_id: { type: 'number', minimum: 1, description: 'Target asset slot / requirement ID.' },
          assetSlotId: { type: 'number', minimum: 1, description: 'Alias for asset_slot_id.' },
          resource_id: { type: 'number', minimum: 1, description: 'Existing raw resource ID, usually generation_job_create.output_resource_id.' },
          resourceId: { type: 'number', minimum: 1, description: 'Alias for resource_id.' },
          output_resource_id: { type: 'number', minimum: 1, description: 'Alias for resource_id when using generation_job_create.output_resource_id directly.' },
          outputResourceId: { type: 'number', minimum: 1, description: 'Alias for output_resource_id.' },
          resource_ids: { type: 'array', items: { type: 'number', minimum: 1 }, description: 'Existing raw resource IDs for bulk candidate attachment.' },
          resourceIds: { type: 'array', items: { type: 'number', minimum: 1 }, description: 'Alias for resource_ids.' },
          output_resource_ids: { type: 'array', items: { type: 'number', minimum: 1 }, description: 'Alias for resource_ids when using generation_job_create.output_resource_ids directly.' },
          outputResourceIds: { type: 'array', items: { type: 'number', minimum: 1 }, description: 'Alias for output_resource_ids.' },
          source_type: { type: 'string', description: 'Optional audit source type. Defaults to agent.' },
          sourceType: { type: 'string', description: 'Alias for source_type.' },
          source_id: { type: 'number', description: 'Optional source entity/job/canvas ID for audit.' },
          sourceId: { type: 'number', description: 'Alias for source_id.' },
          jobId: { type: 'number', description: 'Alias for source_id when the source is a generation job.' },
          score: { type: 'number', description: 'Optional candidate score.' },
          note: { type: 'string', description: 'Optional review note for why this resource is a candidate.' },
        }
      ), ['asset_slot_id', 'assetSlotId']),
      outputSchema: objectSchema(
        {
          status: { type: 'string' },
          candidate: { type: 'object', description: 'Created or reused asset_slot_candidate.' },
          candidates: { type: 'array', items: { type: 'object' }, description: 'Created or reused candidates for every resource ID.' },
          asset_slot_id: { type: 'number' },
          candidate_asset_slot_id: { type: 'number' },
          candidate_asset_slot_ids: { type: 'array', items: { type: 'number' } },
          resource_id: { type: 'number' },
          resource_ids: { type: 'array', items: { type: 'number' } },
          skipped_resource_ids: { type: 'array', items: { type: 'number' }, description: 'Resource IDs already present in the target candidate set and therefore not reattached.' },
          message: { type: 'string' },
        },
        ['status', 'candidate', 'asset_slot_id', 'resource_id', 'message']
      ),
    },
    {
      name: 'candidate_keyframe_attach',
      description: 'Add one existing raw resource to the reviewable candidate set for an original target keyframe / visual anchor. Use after generation succeeds and an output_resource_id is available. Agent automation should call this once per resource as soon as that resource is available; array aliases are compatibility-only. This creates or reuses a candidate keyframe linked to the original target keyframe, but does not accept, select, bind, or lock the candidate. Do not pass an existing generated candidate keyframe as the target.',
      inputSchema: withCandidateAttachAliasRequirements(objectSchema(
        {
          projectId: { type: 'number', description: 'Defaults to the current UI project when omitted.' },
          keyframe_id: { type: 'number', minimum: 1, description: 'Original target keyframe / visual anchor ID, not an existing generated candidate keyframe.' },
          keyframeId: { type: 'number', minimum: 1, description: 'Alias for keyframe_id.' },
          target_keyframe_id: { type: 'number', minimum: 1, description: 'Alias for the original target keyframe / visual anchor ID when reusing generated candidate metadata. Do not pass the generated candidate keyframe ID.' },
          targetKeyframeId: { type: 'number', minimum: 1, description: 'Alias for target_keyframe_id; must still be the original target keyframe / visual anchor ID.' },
          resource_id: { type: 'number', minimum: 1, description: 'Existing raw resource ID, usually generation_job_create.output_resource_id.' },
          resourceId: { type: 'number', minimum: 1, description: 'Alias for resource_id.' },
          output_resource_id: { type: 'number', minimum: 1, description: 'Alias for resource_id when using generation_job_create.output_resource_id directly.' },
          outputResourceId: { type: 'number', minimum: 1, description: 'Alias for output_resource_id.' },
          resource_ids: { type: 'array', items: { type: 'number', minimum: 1 }, description: 'Existing raw resource IDs for bulk keyframe candidate attachment.' },
          resourceIds: { type: 'array', items: { type: 'number', minimum: 1 }, description: 'Alias for resource_ids.' },
          output_resource_ids: { type: 'array', items: { type: 'number', minimum: 1 }, description: 'Alias for resource_ids when using generation_job_create.output_resource_ids directly.' },
          outputResourceIds: { type: 'array', items: { type: 'number', minimum: 1 }, description: 'Alias for output_resource_ids.' },
          source_type: { type: 'string', description: 'Optional audit source type. Defaults to agent.' },
          sourceType: { type: 'string', description: 'Alias for source_type.' },
          source_id: { type: 'number', description: 'Optional source entity/job/canvas ID for audit.' },
          sourceId: { type: 'number', description: 'Alias for source_id.' },
          jobId: { type: 'number', description: 'Alias for source_id and source_job_id when the source is a generation job.' },
          title: { type: 'string', description: 'Optional candidate title. Defaults to the target keyframe title/name when available.' },
          description: { type: 'string', description: 'Optional candidate description. Defaults to the target keyframe description when available.' },
          prompt: { type: 'string', description: 'Optional candidate prompt. Defaults to the target keyframe prompt or description when available.' },
          note: { type: 'string', description: 'Optional review note for why this resource is a candidate.' },
        }
      ), ['keyframe_id', 'keyframeId', 'target_keyframe_id', 'targetKeyframeId']),
      outputSchema: objectSchema(
        {
          status: { type: 'string' },
          candidate: { type: 'object', description: 'Created or reused keyframe candidate.' },
          candidates: { type: 'array', items: { type: 'object' }, description: 'Created or reused keyframe candidates for every resource ID.' },
          keyframe_id: { type: 'number' },
          resource_id: { type: 'number' },
          resource_ids: { type: 'array', items: { type: 'number' } },
          skipped_resource_ids: { type: 'array', items: { type: 'number' }, description: 'Resource IDs already present in the target candidate set and therefore not reattached.' },
          message: { type: 'string' },
        },
        ['status', 'candidate', 'keyframe_id', 'resource_id', 'message']
      ),
    },
  ]
}
