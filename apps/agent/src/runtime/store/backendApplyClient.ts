import type { JSONValue } from '../types.js'
import type { ApplyDraftReview } from './draftApply.js'

export interface BackendApplyClientOptions {
  baseURL?: string
}

export interface BackendApplyResult {
  performed: boolean
  method?: 'PATCH' | 'POST'
  url?: string
  payload?: Record<string, JSONValue>
  response?: JSONValue
  skippedReason?: string
}

const PATCH_ROUTES: Record<string, string> = {
  script: '/scripts/:id',
  setting: '/settings/:id',
  asset_slot: '/projects/:projectId/entities/asset-slots/:id',
  segment: '/projects/:projectId/entities/segments/:id',
  scene_moment: '/projects/:projectId/entities/scene-moments/:id',
  storyboard_script: '/projects/:projectId/entities/storyboard-scripts/:id',
  storyboard_line: '/projects/:projectId/entities/storyboard-lines/:id',
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
  setting: new Set(['type', 'name', 'alias', 'description', 'content', 'status', 'importance', 'tags', 'profile_json']),
  asset_slot: new Set(['name', 'kind', 'description', 'prompt_hint', 'priority', 'resource_id', 'locked_asset_slot_id', 'status', 'metadata_json']),
  segment: new Set(['title', 'kind', 'summary', 'content', 'production_id', 'text_block_id', 'status', 'metadata_json']),
  scene_moment: new Set(['title', 'description', 'time_text', 'location_text', 'condition_text', 'action_text', 'mood', 'status', 'metadata_json']),
  storyboard_script: new Set(['name', 'description', 'is_primary', 'status', 'metadata_json']),
  storyboard_line: new Set(['title', 'kind', 'description', 'dialogue', 'visual_intent', 'duration_sec', 'status', 'metadata_json']),
  content_unit: new Set(['title', 'kind', 'description', 'prompt', 'duration_sec', 'status', 'metadata_json']),
  keyframe: new Set(['title', 'description', 'prompt', 'resource_id', 'status', 'metadata_json']),
  preview_timeline: new Set(['name', 'duration_sec', 'is_primary', 'status', 'metadata_json']),
  delivery_version: new Set(['name', 'description', 'duration_sec', 'is_primary', 'status', 'metadata_json']),
}

export class BackendApplyClient {
  private readonly baseURL?: string

  constructor(options: BackendApplyClientOptions = {}) {
    this.baseURL = normalizeBaseURL(options.baseURL ?? process.env.MOVSCRIPT_BACKEND_API_BASE_URL ?? process.env.MOVSCRIPT_API_BASE_URL)
  }

  isEnabled(): boolean {
    return !!this.baseURL
  }

  async applyReview(review: ApplyDraftReview, userId?: number | string): Promise<BackendApplyResult> {
    if (!this.baseURL) {
      return { performed: false, skippedReason: 'backend apply disabled: MOVSCRIPT_BACKEND_API_BASE_URL is not configured' }
    }
    const request = buildPatchRequest(review)
    const url = `${this.baseURL}${request.path}`
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (userId !== undefined) headers['X-User-ID'] = String(userId)

    const response = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(request.payload),
    })
    const responseText = await response.text()
    const parsed = parseJSONText(responseText)
    if (!response.ok) {
      throw new Error(`backend PATCH ${request.path} failed: HTTP ${response.status}${responseText ? ` ${responseText}` : ''}`)
    }
    return {
      performed: true,
      method: 'PATCH',
      url,
      payload: request.payload,
      ...(parsed !== undefined ? { response: parsed } : {}),
    }
  }

  async applyProposal(projectId: number, payload: Record<string, JSONValue>, userId?: number | string): Promise<BackendApplyResult> {
    if (!this.baseURL) {
      return { performed: false, skippedReason: 'backend apply disabled: MOVSCRIPT_BACKEND_API_BASE_URL is not configured' }
    }
    const path = `/projects/${encodeURIComponent(String(projectId))}/entities/production-proposals/apply`
    const url = `${this.baseURL}${path}`
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (userId !== undefined) headers['X-User-ID'] = String(userId)

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    const responseText = await response.text()
    const parsed = parseJSONText(responseText)
    if (!response.ok) {
      throw new Error(`backend POST ${path} failed: HTTP ${response.status}${responseText ? ` ${responseText}` : ''}`)
    }
    return {
      performed: true,
      method: 'POST',
      url,
      payload,
      ...(parsed !== undefined ? { response: parsed } : {}),
    }
  }
}

export function buildPatchRequest(review: ApplyDraftReview): { path: string; payload: Record<string, JSONValue> } {
  const entityType = review.target.entityType
  const entityId = review.target.entityId
  const field = review.target.field
  if (!entityType || !(entityType in PATCH_ROUTES)) {
    throw new Error(`apply_draft does not support target entity type: ${entityType ?? 'unknown'}`)
  }
  if (entityId === undefined || entityId === null || String(entityId).trim() === '') {
    throw new Error('apply_draft requires target entity id')
  }
  const route = PATCH_ROUTES[entityType]
  const projectId = review.target.projectId
  if (route.includes(':projectId') && (projectId === undefined || projectId === null || String(projectId).trim() === '')) {
    throw new Error(`apply_draft requires projectId for target entity type: ${entityType}`)
  }
  if (!field || !FIELD_ALLOWLIST[entityType].has(field)) {
    throw new Error(`apply_draft cannot write field ${field ?? 'unknown'} on ${entityType}`)
  }
  return {
    path: route
      .replace(':projectId', encodeURIComponent(String(projectId)))
      .replace(':id', encodeURIComponent(String(entityId))),
    payload: {
      [field]: review.proposedValue,
    },
  }
}

function normalizeBaseURL(value: string | undefined): string | undefined {
  if (!value || !value.trim()) return undefined
  const trimmed = value.trim().replace(/\/+$/, '')
  return trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`
}

function parseJSONText(text: string): JSONValue | undefined {
  if (!text.trim()) return undefined
  try {
    return JSON.parse(text) as JSONValue
  } catch {
    return text
  }
}
