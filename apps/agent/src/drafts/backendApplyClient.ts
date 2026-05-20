import type { JSONValue } from '../types.js'
import { isJSONRecord as isRecord } from '../jsonValue.js'
import { isValidAgentProjectId, isValidAgentReferenceId } from '../context/runtimeContext.js'
import type { ApplyDraftReview } from './draftApply.js'

export interface BackendApplyClientOptions {
  baseURL?: string
}

export interface BackendApplyAuthContext {
  userId?: number | string
  backendAuthToken?: string
  backendAPIBaseURL?: string
}

export interface BackendApplyResult {
  performed: boolean
  method?: 'GET' | 'PATCH' | 'POST'
  url?: string
  payload?: Record<string, JSONValue>
  response?: JSONValue
  skippedReason?: string
}

export interface BackendApplyErrorDetail {
  method: 'GET' | 'PATCH' | 'POST'
  path: string
  status: number
  responseText: string
  response?: JSONValue
}

export class BackendApplyHTTPError extends Error {
  readonly detail: BackendApplyErrorDetail

  constructor(message: string, detail: BackendApplyErrorDetail) {
    super(message)
    this.name = 'BackendApplyHTTPError'
    this.detail = detail
  }
}

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
  asset_slot: new Set(['name', 'kind', 'description', 'prompt_hint', 'priority', 'resource_id', 'locked_asset_slot_id', 'status', 'metadata_json']),
  segment: new Set(['title', 'kind', 'summary', 'content', 'production_id', 'text_block_id', 'status', 'metadata_json']),
  scene_moment: new Set(['title', 'description', 'time_text', 'location_text', 'condition_text', 'action_text', 'mood', 'status', 'metadata_json']),
  storyboard_script: new Set(['name', 'description', 'is_primary', 'status', 'metadata_json']),
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

  async applyReview(review: ApplyDraftReview, auth?: BackendApplyAuthContext): Promise<BackendApplyResult> {
    const baseURL = this.resolveBaseURL(auth)
    if (!baseURL) {
      return { performed: false, skippedReason: 'backend apply disabled: MOVSCRIPT_BACKEND_API_BASE_URL is not configured' }
    }
    const request = buildApplyRequest(review)
    const url = `${baseURL}${request.path}`
    const headers = buildHeaders(auth)

    const response = await fetch(url, {
      method: request.method,
      headers,
      body: JSON.stringify(request.payload),
    })
    const responseText = await response.text()
    const parsed = parseJSONText(responseText)
    if (!response.ok) {
      throw new BackendApplyHTTPError(`backend ${request.method} ${request.path} failed: HTTP ${response.status}${responseText ? ` ${responseText}` : ''}`, {
        method: request.method,
        path: request.path,
        status: response.status,
        responseText,
        ...(parsed !== undefined ? { response: parsed } : {}),
      })
    }
    return {
      performed: true,
      method: request.method,
      url,
      payload: request.payload,
      ...(parsed !== undefined ? { response: parsed } : {}),
    }
  }

  async applyProposal(projectId: number, payload: Record<string, JSONValue>, auth?: BackendApplyAuthContext): Promise<BackendApplyResult> {
    const baseURL = this.resolveBaseURL(auth)
    if (!baseURL) {
      return { performed: false, skippedReason: 'backend apply disabled: MOVSCRIPT_BACKEND_API_BASE_URL is not configured' }
    }
    const path = `/projects/${encodeURIComponent(String(projectId))}/entities/production-proposals/apply`
    const url = `${baseURL}${path}`
    const headers = buildHeaders(auth)

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    const responseText = await response.text()
    const parsed = parseJSONText(responseText)
    if (!response.ok) {
      throw new BackendApplyHTTPError(`backend POST ${path} failed: HTTP ${response.status}${responseText ? ` ${responseText}` : ''}`, {
        method: 'POST',
        path,
        status: response.status,
        responseText,
        ...(parsed !== undefined ? { response: parsed } : {}),
      })
    }
    return {
      performed: true,
      method: 'POST',
      url,
      payload,
      ...(parsed !== undefined ? { response: parsed } : {}),
    }
  }

  async getProject(projectId: number, auth?: BackendApplyAuthContext): Promise<BackendApplyResult> {
    const baseURL = this.resolveBaseURL(auth)
    if (!baseURL) {
      return { performed: false, skippedReason: 'backend read disabled: MOVSCRIPT_BACKEND_API_BASE_URL is not configured' }
    }
    const path = `/projects/${encodeURIComponent(String(projectId))}`
    const url = `${baseURL}${path}`
    const response = await fetch(url, {
      method: 'GET',
      headers: buildHeaders(auth),
    })
    const responseText = await response.text()
    const parsed = parseJSONText(responseText)
    if (!response.ok) {
      throw new BackendApplyHTTPError(`backend GET ${path} failed: HTTP ${response.status}${responseText ? ` ${responseText}` : ''}`, {
        method: 'GET',
        path,
        status: response.status,
        responseText,
        ...(parsed !== undefined ? { response: parsed } : {}),
      })
    }
    return {
      performed: true,
      method: 'GET',
      url,
      ...(parsed !== undefined ? { response: parsed } : {}),
    }
  }

  async previewApplyReview(review: ApplyDraftReview, auth?: BackendApplyAuthContext): Promise<BackendApplyResult> {
    const baseURL = this.resolveBaseURL(auth)
    if (!baseURL) {
      return { performed: false, skippedReason: 'backend apply preview disabled: MOVSCRIPT_BACKEND_API_BASE_URL is not configured' }
    }
    const request = buildApplyRequest(review)
    if (!isProjectLayerProposalTarget(review) && !isProductionProposalTarget(review)) {
      return { performed: false, skippedReason: 'backend apply preview is only implemented for proposal drafts' }
    }
    const path = request.path.replace(/\/apply$/, '/apply-preview')
    const url = `${baseURL}${path}`
    const response = await fetch(url, {
      method: request.method,
      headers: buildHeaders(auth),
      body: JSON.stringify(request.payload),
    })
    const responseText = await response.text()
    const parsed = parseJSONText(responseText)
    if (!response.ok) {
      throw new BackendApplyHTTPError(`backend ${request.method} ${path} failed: HTTP ${response.status}${responseText ? ` ${responseText}` : ''}`, {
        method: request.method,
        path,
        status: response.status,
        responseText,
        ...(parsed !== undefined ? { response: parsed } : {}),
      })
    }
    return {
      performed: true,
      method: request.method,
      url,
      payload: request.payload,
      ...(parsed !== undefined ? { response: parsed } : {}),
    }
  }

  private resolveBaseURL(auth?: BackendApplyAuthContext): string | undefined {
    return normalizeBaseURL(auth?.backendAPIBaseURL) ?? this.baseURL
  }
}

export function buildPatchRequest(review: ApplyDraftReview): { path: string; payload: Record<string, JSONValue> } {
  const request = buildApplyRequest(review)
  if (request.method !== 'PATCH') {
    throw new Error(`apply_draft does not support target entity type: ${review.target.entityType ?? 'unknown'}`)
  }
  return { path: request.path, payload: request.payload }
}

function buildApplyRequest(review: ApplyDraftReview): { method: 'PATCH' | 'POST'; path: string; payload: Record<string, JSONValue> } {
  if (isProjectLayerProposalTarget(review)) {
    return buildProjectLayerProposalRequest(review)
  }
  if (isProductionProposalTarget(review)) {
    return buildProductionProposalRequest(review)
  }
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
  if (route.includes(':projectId') && !isValidAgentProjectId(projectId)) {
    throw new Error(`apply_draft requires projectId for target entity type: ${entityType}`)
  }
  if (!field || !FIELD_ALLOWLIST[entityType].has(field)) {
    throw new Error(`apply_draft cannot write field ${field ?? 'unknown'} on ${entityType}`)
  }
  return {
    method: 'PATCH',
    path: route
      .replace(':projectId', encodeURIComponent(String(projectId)))
      .replace(':id', encodeURIComponent(String(entityId))),
    payload: {
      [field]: review.proposedValue,
    },
  }
}

function buildProjectLayerProposalRequest(review: ApplyDraftReview): { method: 'POST'; path: string; payload: Record<string, JSONValue> } {
  const projectId = resolveProjectId(review)
  const payload = normalizeProjectLayerProposalPayloadForKind(review.proposedValue, review.draftKind)
  const routeSegment = projectLayerProposalRouteSegment(inferProjectLayerProposalDraftKind(payload, review.draftKind))
  return {
    method: 'POST',
    path: `/projects/${encodeURIComponent(String(projectId))}/entities/${routeSegment}/apply`,
    payload,
  }
}

function isProjectLayerProposalTarget(review: ApplyDraftReview): boolean {
  return review.draftKind === 'setting_proposal'
    || review.draftKind === 'asset_proposal'
    || review.draftKind === 'project_standards_proposal'
    || (review.target.entityType === 'project' && review.target.field === 'proposal')
}

function buildProductionProposalRequest(review: ApplyDraftReview): { method: 'POST'; path: string; payload: Record<string, JSONValue> } {
  const projectId = resolveProjectId(review)
  const payload = normalizeProductionProposalPayload(review.proposedValue, review.target.entityId)
  return {
    method: 'POST',
    path: `/projects/${encodeURIComponent(String(projectId))}/entities/production-proposals/apply`,
    payload,
  }
}

function isProductionProposalTarget(review: ApplyDraftReview): boolean {
  return review.draftKind === 'production_proposal' || review.target.entityType === 'production'
}

function resolveProjectId(review: ApplyDraftReview): number {
  const candidate = review.target.projectId ?? (isProjectLayerProposalTarget(review) ? review.target.entityId : undefined)
  if (!isValidAgentProjectId(candidate)) {
    throw new Error('apply_draft requires projectId for proposal apply')
  }
  return candidate
}

function normalizeProjectLayerProposalPayload(value: JSONValue): Record<string, JSONValue> {
  if (typeof value === 'string') {
    const parsed = parseJSONText(value)
    if (!isRecord(parsed)) {
      throw new Error('project-layer proposal draft content must be a JSON object')
    }
    return parsed as Record<string, JSONValue>
  }
  if (!isRecord(value)) {
    throw new Error('project-layer proposal draft content must be a JSON object')
  }
  return value as Record<string, JSONValue>
}

function normalizeProjectLayerProposalPayloadForKind(value: JSONValue, kind: ApplyDraftReview['draftKind']): Record<string, JSONValue> {
  const payload = normalizeProjectLayerProposalPayload(value)
  const effectiveKind = inferProjectLayerProposalDraftKind(payload, kind)
  if (effectiveKind === 'project_standards_proposal') {
    const proposal = isRecord(payload.proposal) ? payload.proposal : {}
    if (proposal.creative_references !== undefined || proposal.asset_slots !== undefined) {
      throw new Error('project_standards_proposal only supports proposal.project_style; use setting_proposal or asset_proposal for project-layer lists')
    }
    return {
      ...payload,
      scope: 'project_standards_proposal',
      mode: 'snapshot',
      proposal: {
        ...proposal,
        project_style: normalizeProjectStylePatch(proposal.project_style),
      },
    }
  }
  if (effectiveKind !== 'setting_proposal' && effectiveKind !== 'asset_proposal') return payload
  const proposal = isRecord(payload.proposal) ? payload.proposal : {}
  return {
    ...payload,
    scope: effectiveKind,
    mode: 'snapshot',
    proposal: {
      ...proposal,
      creative_references: effectiveKind === 'setting_proposal' ? normalizeProjectLayerProposalSnapshotNodes(proposal.creative_references) : [],
      asset_slots: effectiveKind === 'asset_proposal' ? normalizeProjectLayerProposalSnapshotNodes(proposal.asset_slots) : [],
    },
  }
}

function normalizeProjectStylePatch(value: JSONValue | undefined): Record<string, JSONValue> {
  if (!isRecord(value)) return {}
  const out: Record<string, JSONValue> = { ...value }
  if (value.shot_size_system !== undefined) {
    out.shot_size_system = normalizeProjectStyleStringList(value.shot_size_system)
  }
  if (value.negative_rules !== undefined) {
    out.negative_rules = normalizeProjectStyleStringList(value.negative_rules)
  }
  return out
}

function normalizeProjectStyleStringList(value: JSONValue): string[] {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/\r?\n/) : [value]
  return items
    .map((item) => projectStyleListItemToString(item))
    .map((item) => item.trim())
    .filter(Boolean)
}

function projectStyleListItemToString(value: JSONValue): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (!isRecord(value)) return ''
  const key = stringFromJSONValue(value.key)
  const label = stringFromJSONValue(value.label)
  const usage = stringFromJSONValue(value.usage)
  const composition = stringFromJSONValue(value.composition)
  const description = stringFromJSONValue(value.description)
  const name = [key, label].filter(Boolean).join(' ')
  const details = [usage, composition, description].filter(Boolean).join('；')
  return [name, details].filter(Boolean).join('：')
}

function stringFromJSONValue(value: JSONValue | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function inferProjectLayerProposalDraftKind(payload: Record<string, JSONValue>, kind: ApplyDraftReview['draftKind']): ApplyDraftReview['draftKind'] {
  if (kind === 'setting_proposal' || kind === 'asset_proposal' || kind === 'project_standards_proposal') return kind
  const schema = typeof payload.schema === 'string' ? payload.schema : ''
  if (schema === 'movscript.setting_proposal.v1') return 'setting_proposal'
  if (schema === 'movscript.asset_proposal.v1') return 'asset_proposal'
  if (schema === 'movscript.project_standards_proposal.v1') return 'project_standards_proposal'
  const scope = typeof payload.scope === 'string' ? payload.scope : ''
  if (scope === 'setting_proposal' || scope === 'asset_proposal' || scope === 'project_standards_proposal') return scope
  return kind
}

function projectLayerProposalRouteSegment(kind: ApplyDraftReview['draftKind']): string {
  switch (kind) {
  case 'setting_proposal':
    return 'setting-proposals'
  case 'asset_proposal':
    return 'asset-proposals'
  case 'project_standards_proposal':
    return 'project-standards-proposals'
  default:
    throw new Error(`unsupported project-layer proposal kind: ${kind}`)
  }
}

function normalizeProjectLayerProposalSnapshotNodes(value: JSONValue): JSONValue[] {
  if (!Array.isArray(value)) return []
  return value.map((item, index) => {
    if (isRecord(item) && item.fields !== undefined) {
      throw new Error(`project-layer proposal snapshot node ${index} uses deprecated fields wrapper; put editable values directly on the node`)
    }
    return item
  })
}

function normalizeProductionProposalPayload(value: JSONValue, fallbackProductionId: unknown): Record<string, JSONValue> {
  const parsed = typeof value === 'string' ? parseJSONText(value) : value
  if (!isRecord(parsed)) {
    throw new Error('production proposal draft content must be a JSON object')
  }
  const productionId = parsed.production_id ?? parsed.productionId ?? fallbackProductionId
  if ((typeof productionId !== 'string' && typeof productionId !== 'number') || String(productionId).trim() === '') {
    throw new Error('production proposal draft content requires productionId')
  }
  if (!isRecord(parsed.proposal)) {
    throw new Error('production proposal draft content requires proposal')
  }
  if (parsed.mode !== 'snapshot') {
    throw new Error('production proposal draft content requires mode "snapshot"')
  }
  if (containsActionField(parsed.proposal)) {
    throw new Error('production proposal snapshot must not include action fields')
  }
  return {
    ...parsed,
    mode: 'snapshot',
    production_id: productionId,
    proposal_scope: parsed.proposal_scope ?? parsed.proposalScope ?? 'production',
  }
}

function containsActionField(value: JSONValue): boolean {
  if (Array.isArray(value)) return value.some(containsActionField)
  if (!isRecord(value)) return false
  if (Object.prototype.hasOwnProperty.call(value, 'action')) return true
  return Object.values(value).some(containsActionField)
}

function normalizeBaseURL(value: string | undefined): string | undefined {
  if (!value || !value.trim()) return undefined
  const trimmed = value.trim().replace(/\/+$/, '')
  return trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`
}

function buildHeaders(auth?: BackendApplyAuthContext): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth?.backendAuthToken) headers.Authorization = `Bearer ${auth.backendAuthToken}`
  const userId = normalizeBackendApplyAuthUserId(auth?.userId)
  if (userId !== undefined) headers['X-User-ID'] = String(userId)
  return headers
}

export function normalizeBackendApplyAuthUserId(value: unknown): number | string | undefined {
  return isValidAgentReferenceId(value) ? value : undefined
}

function parseJSONText(text: string): JSONValue | undefined {
  if (!text.trim()) return undefined
  try {
    return JSON.parse(text) as JSONValue
  } catch {
    return text
  }
}
