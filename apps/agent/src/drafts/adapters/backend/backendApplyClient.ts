import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { copyFile, mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { JSONValue } from '../../../shared/protocol/types.js'
import { isJSONRecord as isRecord } from '../../../shared/json/jsonValue.js'
import { isValidAgentProjectId, isValidAgentReferenceId } from '../../../context/runtime/runtimeContext.js'
import type { ApplyDraftReview } from '../../apply/draftApply.js'

export interface BackendApplyClientOptions {
  baseURL?: string
  resourceCacheDir?: string
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

export interface BackendResourceFileDownloadResult {
  performed: boolean
  method?: 'GET'
  url?: string
  path?: string
  contentType?: string
  contentLength?: number
  skippedReason?: string
}

export interface BackendJSONReadResult {
  performed: boolean
  method?: 'GET'
  url?: string
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
  private readonly resourceCacheDir: string
  private readonly resourceFileDownloads = new Map<string, Promise<ResourceFileCacheMetadata>>()

  constructor(options: BackendApplyClientOptions = {}) {
    this.baseURL = normalizeBaseURL(options.baseURL ?? process.env.MOVSCRIPT_BACKEND_API_BASE_URL ?? process.env.MOVSCRIPT_API_BASE_URL)
    this.resourceCacheDir = options.resourceCacheDir ?? process.env.MOVSCRIPT_AGENT_RESOURCE_CACHE_DIR ?? join(tmpdir(), 'movscript-agent-resource-cache')
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

  async getJSON(path: string, auth?: BackendApplyAuthContext, options: { signal?: AbortSignal } = {}): Promise<BackendJSONReadResult> {
    const baseURL = this.resolveBaseURL(auth)
    if (!baseURL) {
      return { performed: false, skippedReason: 'backend read disabled: MOVSCRIPT_BACKEND_API_BASE_URL is not configured' }
    }
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    const url = `${baseURL}${normalizedPath}`
    const response = await fetch(url, {
      method: 'GET',
      headers: buildHeaders(auth),
      signal: options.signal,
    })
    const responseText = await response.text()
    const parsed = parseJSONText(responseText)
    if (!response.ok) {
      throw new BackendApplyHTTPError(`backend GET ${normalizedPath} failed: HTTP ${response.status}${responseText ? ` ${responseText}` : ''}`, {
        method: 'GET',
        path: normalizedPath,
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

  async downloadResourceFile(resourceId: number, targetPath: string, auth?: BackendApplyAuthContext, options: { signal?: AbortSignal } = {}): Promise<BackendResourceFileDownloadResult> {
    const baseURL = this.resolveBaseURL(auth)
    if (!baseURL) {
      return { performed: false, skippedReason: 'backend resource download disabled: MOVSCRIPT_BACKEND_API_BASE_URL is not configured' }
    }
    const path = `/resources/${encodeURIComponent(String(resourceId))}/file`
    const url = `${baseURL}${path}`
    const cacheKey = resourceFileCacheKey(baseURL, resourceId, auth)
    const cachePath = join(this.resourceCacheDir, `${cacheKey}.bin`)
    const metadataPath = join(this.resourceCacheDir, `${cacheKey}.json`)
    const cached = await readCachedResourceFile(cachePath, metadataPath)
    if (cached) {
      await copyCachedResourceFile(cachePath, targetPath)
      return {
        performed: true,
        method: 'GET',
        url,
        path: targetPath,
        ...(cached.contentType ? { contentType: cached.contentType } : {}),
        ...(Number.isFinite(cached.contentLength) ? { contentLength: cached.contentLength } : {}),
      }
    }

    let download = this.resourceFileDownloads.get(cacheKey)
    if (!download) {
      download = downloadResourceFileToCache({
        url,
        path,
        auth,
        cachePath,
        metadataPath,
        signal: options.signal,
      }).finally(() => {
        this.resourceFileDownloads.delete(cacheKey)
      })
      this.resourceFileDownloads.set(cacheKey, download)
    }

    const downloaded = await waitForResourceFileCache(download, options.signal)
    await copyCachedResourceFile(cachePath, targetPath)
    return {
      performed: true,
      method: 'GET',
      url,
      path: targetPath,
      ...(downloaded.contentType ? { contentType: downloaded.contentType } : {}),
      ...(Number.isFinite(downloaded.contentLength) ? { contentLength: downloaded.contentLength } : {}),
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
  const creativeReferences = effectiveKind === 'setting_proposal' ? normalizeProjectLayerProposalSnapshotNodes(proposal.creative_references) : []
  const assetSlots = effectiveKind === 'asset_proposal' ? normalizeProjectLayerProposalSnapshotNodes(proposal.asset_slots) : []
  return {
    ...payload,
    scope: effectiveKind,
    mode: 'snapshot',
    proposal: {
      ...proposal,
      creative_references: creativeReferences,
      asset_slots: assetSlots,
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

interface ResourceFileCacheMetadata {
  contentType?: string
  contentLength?: number
  etag?: string
}

interface ResourceFileCacheDownloadInput {
  url: string
  path: string
  auth?: BackendApplyAuthContext
  cachePath: string
  metadataPath: string
  signal?: AbortSignal
}

function resourceFileCacheKey(baseURL: string, resourceId: number, auth?: BackendApplyAuthContext): string {
  const authScope = resourceFileCacheAuthScope(auth)
  const raw = JSON.stringify({
    baseURL,
    resourceId,
    authScope,
  })
  return createHash('sha256').update(raw).digest('hex')
}

function resourceFileCacheAuthScope(auth?: BackendApplyAuthContext): string {
  const userId = normalizeBackendApplyAuthUserId(auth?.userId)
  const tokenHash = auth?.backendAuthToken ? createHash('sha256').update(auth.backendAuthToken).digest('hex') : 'none'
  return `user:${userId !== undefined ? String(userId) : 'anonymous'}:token:${tokenHash}`
}

async function readCachedResourceFile(cachePath: string, metadataPath: string): Promise<ResourceFileCacheMetadata | undefined> {
  let fileStat: Awaited<ReturnType<typeof stat>>
  try {
    fileStat = await stat(cachePath)
  } catch {
    return undefined
  }
  if (!fileStat.isFile() || fileStat.size <= 0) return undefined
  const metadata = await readResourceFileCacheMetadata(metadataPath)
  return {
    ...metadata,
    contentLength: metadata.contentLength ?? fileStat.size,
  }
}

async function downloadResourceFileToCache(input: ResourceFileCacheDownloadInput): Promise<ResourceFileCacheMetadata> {
  const response = await fetch(input.url, {
    method: 'GET',
    headers: buildHeaders(input.auth, { json: false }),
    signal: input.signal,
  })

  if (!response.ok) {
    const responseText = await response.text()
    const parsed = parseJSONText(responseText)
    throw new BackendApplyHTTPError(`backend GET ${input.path} failed: HTTP ${response.status}${responseText ? ` ${responseText}` : ''}`, {
      method: 'GET',
      path: input.path,
      status: response.status,
      responseText,
      ...(parsed !== undefined ? { response: parsed } : {}),
    })
  }
  if (!response.body) throw new Error(`backend GET ${input.path} returned an empty response body`)

  await mkdir(dirname(input.cachePath), { recursive: true })
  const cacheTempPath = `${input.cachePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
  try {
    await pipeline(Readable.fromWeb(response.body as never), createWriteStream(cacheTempPath), { signal: input.signal })
    await rename(cacheTempPath, input.cachePath).catch(async () => {
      await copyFile(cacheTempPath, input.cachePath)
      await unlink(cacheTempPath).catch(() => undefined)
    })
  } catch (error) {
    await unlink(cacheTempPath).catch(() => undefined)
    throw error
  }

  const contentLength = Number(response.headers.get('content-length'))
  const metadata: ResourceFileCacheMetadata = {
    contentType: response.headers.get('content-type') ?? undefined,
    contentLength: Number.isFinite(contentLength) ? contentLength : undefined,
    etag: response.headers.get('etag') ?? undefined,
  }
  await writeResourceFileCacheMetadata(input.metadataPath, metadata)
  return metadata
}

async function waitForResourceFileCache(download: Promise<ResourceFileCacheMetadata>, signal?: AbortSignal): Promise<ResourceFileCacheMetadata> {
  if (!signal) return download
  if (signal.aborted) throw abortSignalError(signal)
  return Promise.race([
    download,
    new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(abortSignalError(signal)), { once: true })
    }),
  ])
}

function abortSignalError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('resource download aborted')
}

async function copyCachedResourceFile(cachePath: string, targetPath: string): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true })
  await copyFile(cachePath, targetPath)
}

async function readResourceFileCacheMetadata(metadataPath: string): Promise<ResourceFileCacheMetadata> {
  try {
    const parsed = JSON.parse(await readFile(metadataPath, 'utf8')) as Record<string, unknown>
    return {
      ...(typeof parsed.contentType === 'string' && parsed.contentType ? { contentType: parsed.contentType } : {}),
      ...(typeof parsed.contentLength === 'number' && Number.isFinite(parsed.contentLength) ? { contentLength: parsed.contentLength } : {}),
      ...(typeof parsed.etag === 'string' && parsed.etag ? { etag: parsed.etag } : {}),
    }
  } catch {
    return {}
  }
}

async function writeResourceFileCacheMetadata(metadataPath: string, metadata: ResourceFileCacheMetadata): Promise<void> {
  await writeFile(metadataPath, JSON.stringify(metadata), 'utf8').catch(() => undefined)
}

function normalizeBaseURL(value: string | undefined): string | undefined {
  if (!value || !value.trim()) return undefined
  const trimmed = value.trim().replace(/\/+$/, '')
  return trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`
}

function buildHeaders(auth?: BackendApplyAuthContext, options: { json?: boolean } = { json: true }): Record<string, string> {
  const headers: Record<string, string> = options.json === false ? {} : { 'Content-Type': 'application/json' }
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
