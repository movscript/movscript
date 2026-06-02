import type { JSONValue } from '../../shared/protocol/types.js'
import { isRecord } from '../../shared/json/jsonValue.js'
import { searchReferenceChunks } from '../search/referenceSearch.js'
import type { ReferenceHit, ReferenceKind, ReferenceRetrievalMethod, ReferenceSearchResponse } from '../shared/types.js'
import type { ReferenceStore } from '../store/referenceStore.js'

export interface ReferenceBackendAuth {
  backendAuthToken?: string
  backendAPIBaseURL?: string
}

export interface ReferenceBackendClient {
  getJSON(
    path: string,
    auth?: ReferenceBackendAuth,
    options?: { signal?: AbortSignal },
  ): Promise<{ performed: boolean; response?: JSONValue; skippedReason?: string }>
}

export interface ReferenceRequestContext {
  auth?: ReferenceBackendAuth
  signal?: AbortSignal
}

export class ReferenceManager {
  constructor(
    private readonly store: ReferenceStore,
    private readonly options: { backendClient?: ReferenceBackendClient } = {},
  ) {}

  async search(input: Record<string, JSONValue>, context: ReferenceRequestContext = {}): Promise<ReferenceSearchResponse> {
    const query = stringField(input.query) ?? ''
    const kind = referenceKind(input.kind)
    const method = retrievalMethod(input.method)
    const limit = normalizeLimit(numberField(input.limit))
    const sources = referenceSources(input.sources ?? input.source, kind)
    const warnings: string[] = []
    const results: ReferenceHit[] = []

    if (sources.has('local_reference') && (!kind || kind === 'text')) {
      results.push(...this.searchLocalText(input, limit, method))
    }

    if (sources.has('external_resource') && (!kind || kind === 'image' || kind === 'video')) {
      const external = await this.searchExternalResources({ query, kind, limit, context })
      results.push(...external.results)
      warnings.push(...external.warnings)
    }

    if (sources.has('shot_library') && (!kind || kind === 'video')) {
      const shots = await this.searchShotLibrary({ query, limit, method, context })
      results.push(...shots.results)
      warnings.push(...shots.warnings)
    }

    const response: ReferenceSearchResponse = { results: results.slice(0, limit) }
    if (warnings.length > 0) response.warnings = warnings
    return response
  }

  get(input: Record<string, JSONValue>, options: { maxChars?: number } = {}): JSONValue {
    const id = normalizeLocalReferenceId(stringField(input.id))
    if (!id) throw new Error('reference_get requires id')
    const chunk = this.store.getChunk(id)
    if (!chunk) throw new Error(`reference not found: ${id}`)
    const requestedMaxChars = numberField(input.maxChars) ?? 4000
    const maxChars = Math.min(requestedMaxChars, options.maxChars ?? requestedMaxChars)
    const content = chunk.content.slice(0, Math.max(0, maxChars))
    return {
      kind: 'text',
      source: 'local_reference',
      retrievalMethod: 'keyword',
      id: chunk.id,
      localReferenceSetId: chunk.localReferenceSetId,
      domain: chunk.domain,
      title: chunk.title,
      summary: chunk.summary,
      tags: chunk.tags,
      content,
      contentHash: chunk.contentHash,
      truncated: content.length < chunk.content.length,
      sourcePath: chunk.sourcePath ?? null,
      charCount: chunk.charCount,
    } as unknown as JSONValue
  }

  private searchLocalText(input: Record<string, JSONValue>, limit: number, method: ReferenceRetrievalMethod | undefined): ReferenceHit[] {
    return searchReferenceChunks({
      chunks: this.store.listChunks(),
      query: stringField(input.query),
      domain: stringField(input.domain),
      tags: stringArray(input.tags),
      limit,
    }).map((result): ReferenceHit => ({
      id: `local_reference:${result.id}`,
      kind: 'text',
      source: 'local_reference',
      retrievalMethod: method ?? 'keyword',
      title: result.title,
      summary: result.summary,
      score: result.score,
      metadata: {
        localId: result.id,
        localReferenceSetId: result.localReferenceSetId,
        domain: result.domain,
        tags: result.tags,
        contentHash: result.contentHash,
        charCount: result.charCount,
        ...(result.sourcePath ? { sourcePath: result.sourcePath } : {}),
      },
    }))
  }

  private async searchExternalResources(input: {
    query: string
    kind?: ReferenceKind
    limit: number
    context: ReferenceRequestContext
  }): Promise<{ results: ReferenceHit[]; warnings: string[] }> {
    if (!this.options.backendClient) return { results: [], warnings: ['external_resource source unavailable: backend client not configured'] }
    try {
      const params = new URLSearchParams()
      if (input.query) params.set('q', input.query)
      if (input.kind === 'image' || input.kind === 'video') params.set('media_type', input.kind)
      params.set('page', '1')
      params.set('page_size', String(input.limit))
      const read = await this.options.backendClient.getJSON(`/external-resources/search?${params.toString()}`, input.context.auth, requestOptions(input.context))
      if (!read.performed) return { results: [], warnings: [read.skippedReason ?? 'external_resource source unavailable'] }
      const body = isRecord(read.response) ? read.response : {}
      const items = Array.isArray(body.items) ? body.items : []
      return {
        results: items.flatMap((item) => externalResourceHit(item)),
        warnings: [],
      }
    } catch (error) {
      return { results: [], warnings: [`external_resource source failed: ${errorMessage(error)}`] }
    }
  }

  private async searchShotLibrary(input: {
    query: string
    limit: number
    method?: ReferenceRetrievalMethod
    context: ReferenceRequestContext
  }): Promise<{ results: ReferenceHit[]; warnings: string[] }> {
    if (!this.options.backendClient) return { results: [], warnings: ['shot_library source unavailable: backend client not configured'] }
    try {
      const params = new URLSearchParams()
      if (input.query) params.set('q', input.query)
      params.set('page', '1')
      params.set('page_size', String(input.limit))
      const read = await this.options.backendClient.getJSON(`/shot-references?${params.toString()}`, input.context.auth, requestOptions(input.context))
      if (!read.performed) return { results: [], warnings: [read.skippedReason ?? 'shot_library source unavailable'] }
      const body = isRecord(read.response) ? read.response : {}
      const items = Array.isArray(body.items) ? body.items : []
      return {
        results: items.flatMap((item) => shotReferenceHit(item, input.method)),
        warnings: [],
      }
    } catch (error) {
      return { results: [], warnings: [`shot_library source failed: ${errorMessage(error)}`] }
    }
  }
}

function externalResourceHit(value: unknown): ReferenceHit[] {
  if (!isRecord(value)) return []
  const kind = referenceKind(value.media_type)
  if (kind !== 'image' && kind !== 'video') return []
  const provider = stringField(value.provider_key) ?? 'external'
  const externalId = stringField(value.external_id) ?? stringField(value.source_url) ?? stringField(value.thumbnail_url)
  if (!externalId) return []
  return [{
    id: `external_resource:${provider}:${kind}:${externalId}`,
    kind,
    source: `external_resource:${provider}`,
    retrievalMethod: 'native',
    ...(stringField(value.title) ? { title: stringField(value.title) } : {}),
    ...(stringField(value.description) ? { summary: stringField(value.description) } : {}),
    ...((stringField(value.preview_url) ?? stringField(value.thumbnail_url)) ? { previewUrl: stringField(value.preview_url) ?? stringField(value.thumbnail_url) } : {}),
    ...(stringField(value.source_url) ? { sourceUrl: stringField(value.source_url) } : {}),
    metadata: compactRecord({
      providerKey: provider,
      externalId,
      mediaType: kind,
      thumbnailUrl: stringField(value.thumbnail_url),
      width: numberField(value.width),
      height: numberField(value.height),
      durationSeconds: numberField(value.duration_seconds),
      authorName: stringField(value.author_name),
      authorUrl: stringField(value.author_url),
      attributionText: stringField(value.attribution_text),
      licenseLabel: stringField(value.license_label),
    }),
  }]
}

function shotReferenceHit(value: unknown, method: ReferenceRetrievalMethod | undefined): ReferenceHit[] {
  if (!isRecord(value)) return []
  const rawId = numberField(value.ID) ?? numberField(value.id)
  if (!rawId) return []
  const resource = isRecord(value.resource) ? value.resource : undefined
  const resourceId = numberField(value.resource_id) ?? numberField(resource?.ID) ?? numberField(resource?.id)
  const resourceUrl = stringField(resource?.url)
  return [{
    id: `shot_library:${rawId}`,
    kind: 'video',
    source: 'shot_library',
    retrievalMethod: method ?? 'keyword',
    ...(stringField(value.title) ? { title: stringField(value.title) } : {}),
    ...(stringField(value.summary) ? { summary: stringField(value.summary) } : {}),
    ...(resourceUrl ? { previewUrl: resourceUrl, sourceUrl: resourceUrl } : {}),
    ...(resourceId ? { resourceId } : {}),
    metadata: compactRecord({
      shotReferenceId: rawId,
      resourceId,
      intent: arrayField(value.intent),
      pattern: arrayField(value.pattern),
      shotFunction: arrayField(value.shot_function),
      visualPreference: arrayField(value.visual_preference),
      emotionalEffect: arrayField(value.emotional_effect),
      retrievalText: stringField(value.retrieval_text),
      reusablePrinciple: stringField(value.reusable_principle),
      executionDetails: value.execution_details,
      visualAnalysis: value.visual_analysis,
      sceneSemantics: value.scene_semantics,
      narrativeFunction: value.narrative_function,
      emotionalProfile: value.emotional_profile,
      reusablePattern: value.reusable_pattern,
      searchIndex: value.search_index,
    }),
  }]
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
  return items.length > 0 ? items : undefined
}

function arrayField(value: unknown): string[] | undefined {
  return stringArray(value)
}

function referenceKind(value: unknown): ReferenceKind | undefined {
  return value === 'image' || value === 'video' || value === 'text' ? value : undefined
}

function retrievalMethod(value: unknown): ReferenceRetrievalMethod | undefined {
  return value === 'keyword' || value === 'semantic' || value === 'native' ? value : undefined
}

function referenceSources(value: unknown, kind: ReferenceKind | undefined): Set<string> {
  const explicit = new Set(stringArray(value) ?? (typeof value === 'string' && value.trim() ? [value.trim()] : []))
  if (explicit.size > 0) return explicit
  if (kind === 'image') return new Set(['external_resource'])
  if (kind === 'video') return new Set(['external_resource', 'shot_library'])
  if (kind === 'text') return new Set(['local_reference'])
  return new Set(['local_reference', 'shot_library', 'external_resource'])
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 5
  return Math.min(20, Math.max(1, Math.floor(value)))
}

function normalizeLocalReferenceId(value: string | undefined): string | undefined {
  if (!value) return undefined
  return value.startsWith('local_reference:') ? value.slice('local_reference:'.length) : value
}

function compactRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ''))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function requestOptions(context: ReferenceRequestContext): { signal?: AbortSignal } {
  return context.signal ? { signal: context.signal } : {}
}
