import type { JSONValue } from '../types.js'
import type { ApplyDraftReview } from './draftApply.js'

export interface BackendApplyClientOptions {
  baseURL?: string
}

export interface BackendApplyResult {
  performed: boolean
  method?: 'PATCH'
  url?: string
  payload?: Record<string, JSONValue>
  response?: JSONValue
  skippedReason?: string
}

const PATCH_ROUTES: Record<string, string> = {
  script: '/scripts/:id',
  setting: '/settings/:id',
  storyboard: '/storyboards/:id',
  shot: '/shots/:id',
  scene: '/scenes/:id',
}

const FIELD_ALLOWLIST: Record<string, Set<string>> = {
  script: new Set([
    'title', 'description', 'content', 'status', 'summary', 'characters', 'character_profiles',
    'character_relationships', 'core_settings', 'background', 'scenes_desc', 'hook', 'plot_summary',
    'script_points',
  ]),
  setting: new Set(['type', 'name', 'alias', 'description', 'content', 'status', 'importance', 'tags', 'profile_json']),
  storyboard: new Set([
    'title', 'description', 'notes', 'characters', 'actions', 'dialogue', 'atmosphere', 'camera_angle',
    'camera_movement', 'depth_of_field', 'lighting', 'duration', 'shot_size', 'angle', 'movement',
    'focal_length', 'pacing', 'intent', 'status',
  ]),
  shot: new Set(['description', 'prompt', 'final_description', 'final_prompt', 'is_approved', 'status', 'order']),
  scene: new Set(['number', 'title', 'location', 'time_of_day', 'notes']),
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
  if (!field || !FIELD_ALLOWLIST[entityType].has(field)) {
    throw new Error(`apply_draft cannot write field ${field ?? 'unknown'} on ${entityType}`)
  }
  return {
    path: PATCH_ROUTES[entityType].replace(':id', encodeURIComponent(String(entityId))),
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
