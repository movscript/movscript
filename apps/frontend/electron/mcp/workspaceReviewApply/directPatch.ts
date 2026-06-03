import { stringValue } from '../valueUtils'
import type { WorkspaceReviewApplyRequest } from './types'
import { getObjectValue, toMCPJSONValue } from './utils'

const PATCH_ROUTES: Record<string, string> = {
  script: '/scripts/:id',
  asset_slot: '/projects/:projectId/entities/asset-slots/:id',
  segment: '/projects/:projectId/entities/segments/:id',
  scene_moment: '/projects/:projectId/entities/scene-moments/:id',
  storyboard_script: '/projects/:projectId/entities/storyboard-scripts/:id',
  content_unit: '/projects/:projectId/entities/content-units/:id',
  keyframe: '/projects/:projectId/entities/keyframes/:id',
  preview_timeline: '/projects/:projectId/entities/preview-timelines/:id',
  delivery_version: '/projects/:projectId/entities/delivery-versions/:id',
}

const FIELD_ALLOWLIST: Record<string, Set<string>> = {
  script: new Set([
    'title', 'description', 'content', 'status', 'summary', 'characters', 'character_profiles',
    'character_relationships', 'core_settings', 'background', 'scenes_desc', 'hook', 'plot_summary',
    'script_points',
  ]),
  asset_slot: new Set(['name', 'kind', 'description', 'prompt_hint', 'priority', 'status', 'metadata_json']),
  segment: new Set(['title', 'kind', 'summary', 'content', 'production_id', 'text_block_id', 'status', 'metadata_json']),
  scene_moment: new Set(['title', 'description', 'time_text', 'location_text', 'condition_text', 'action_text', 'mood', 'status', 'metadata_json']),
  storyboard_script: new Set(['name', 'description', 'is_primary', 'status', 'metadata_json']),
  content_unit: new Set(['title', 'kind', 'description', 'prompt', 'duration_sec', 'status', 'metadata_json']),
  keyframe: new Set(['title', 'description', 'prompt', 'status', 'metadata_json']),
  preview_timeline: new Set(['name', 'duration_sec', 'is_primary', 'status', 'metadata_json']),
  delivery_version: new Set(['name', 'description', 'duration_sec', 'is_primary', 'status', 'metadata_json']),
}

export function buildEntityPatchRequest(review: Record<string, unknown>): WorkspaceReviewApplyRequest {
  const target = getObjectValue(review.target, 'target')
  const entityType = stringValue(target.entityType)
  const entityId = target.entityId
  const field = stringValue(target.field)
  if (!entityType || !(entityType in PATCH_ROUTES)) {
    throw new Error(`apply_workspace does not support target entity type: ${entityType ?? 'unknown'}`)
  }
  if (entityId === undefined || entityId === null || String(entityId).trim() === '') {
    throw new Error('apply_workspace requires target entity id')
  }
  const route = PATCH_ROUTES[entityType]
  const projectId = target.projectId
  if (route.includes(':projectId') && (projectId === undefined || projectId === null || String(projectId).trim() === '')) {
    throw new Error(`apply_workspace requires projectId for target entity type: ${entityType}`)
  }
  if (!field || !FIELD_ALLOWLIST[entityType]?.has(field)) {
    throw new Error(`apply_workspace cannot write field ${field ?? 'unknown'} on ${entityType}`)
  }
  return {
    method: 'PATCH',
    path: route
      .replace(':projectId', encodeURIComponent(String(projectId)))
      .replace(':id', encodeURIComponent(String(entityId))),
    payload: {
      [field]: toMCPJSONValue(review.proposedValue),
    } as Record<string, unknown>,
  }
}
