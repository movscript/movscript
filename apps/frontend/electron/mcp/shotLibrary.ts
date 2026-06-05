import { backendGet } from './backendClient'
import { clampNumber, getOptionalNumeric, getOptionalString } from './paramValues'
import { isRecord } from './valueUtils'

interface ShotLibraryPageRequest {
  query?: string
  page?: number
  pageSize?: number
}

export async function queryShotLibrary(args: Record<string, unknown>): Promise<unknown> {
  const id = getOptionalNumeric(args, 'shot_reference_id')
    ?? getOptionalNumeric(args, 'shotReferenceId')
    ?? getOptionalNumeric(args, 'id')
  const includeFull = booleanParam(args.include_full) ?? booleanParam(args.includeFull) ?? false
  const query = getOptionalString(args, 'query') ?? getOptionalString(args, 'q') ?? ''
  const page = Math.floor(clampNumber(getOptionalNumeric(args, 'page') ?? 1, 1, 10000))
  const pageSize = Math.floor(clampNumber(
    getOptionalNumeric(args, 'page_size')
      ?? getOptionalNumeric(args, 'pageSize')
      ?? getOptionalNumeric(args, 'limit')
      ?? getOptionalNumeric(args, 'topK')
      ?? 20,
    1,
    100,
  ))
  const pageData = await fetchShotLibraryPage({ query, page, pageSize })
  const items = Array.isArray(pageData.items) ? pageData.items : []
  const summarized = items.map(item => summarizeShotReference(item, { includeFull }))
  const filtered = id === undefined ? summarized : summarized.filter(item => shotReferenceId(item) === id)

  return {
    query,
    page: numberField(pageData, 'page') ?? page,
    pageSize: numberField(pageData, 'page_size') ?? pageSize,
    total: numberField(pageData, 'total') ?? filtered.length,
    count: filtered.length,
    items: filtered,
    ...(id !== undefined && filtered.length === 0 ? { warning: `shot_reference_id ${id} was not found on the requested page` } : {}),
  }
}

export async function readShotLibrary(uri: string): Promise<unknown> {
  const parsed = parseShotLibraryURI(uri)
  if (!parsed) throw new Error(`Unsupported shot library resource URI: ${uri}`)
  return queryShotLibrary({
    ...(parsed.id !== undefined ? { shot_reference_id: parsed.id, limit: 100 } : {}),
    ...(parsed.query ? { query: parsed.query } : {}),
    ...(parsed.page !== undefined ? { page: parsed.page } : {}),
    ...(parsed.pageSize !== undefined ? { page_size: parsed.pageSize } : {}),
    include_full: true,
  })
}

export function isShotLibraryURI(uri: string): boolean {
  return parseShotLibraryURI(uri) !== null
}

function parseShotLibraryURI(uri: string): { id?: number; query?: string; page?: number; pageSize?: number } | null {
  const match = uri.match(/^movscript:\/\/shot-library(?:\/(\d+))?(?:\?(.*))?$/)
  if (!match) return null
  const params = new URLSearchParams(match[2] ?? '')
  const page = numericParam(params.get('page'))
  const pageSize = numericParam(params.get('page_size') ?? params.get('pageSize') ?? params.get('limit'))
  return {
    ...(match[1] ? { id: Number(match[1]) } : {}),
    ...(params.get('query') || params.get('q') ? { query: params.get('query') ?? params.get('q') ?? '' } : {}),
    ...(page !== undefined ? { page } : {}),
    ...(pageSize !== undefined ? { pageSize } : {}),
  }
}

async function fetchShotLibraryPage(input: ShotLibraryPageRequest): Promise<Record<string, unknown>> {
  const params = new URLSearchParams()
  params.set('page', String(input.page ?? 1))
  params.set('page_size', String(input.pageSize ?? 20))
  if (input.query?.trim()) params.set('q', input.query.trim())
  const data = await backendGet(`/shot-references?${params.toString()}`)
  return isRecord(data) ? data : { items: [] }
}

function summarizeShotReference(item: unknown, options: { includeFull: boolean }): unknown {
  if (!isRecord(item)) return item
  if (options.includeFull) return item
  const resource = isRecord(item.resource) ? item.resource : undefined
  const group = isRecord(item.group) ? item.group : undefined
  return {
    ...picked(item, ['ID', 'id', 'title', 'summary', 'analysis_status', 'analysis_source', 'intent', 'pattern', 'shot_function', 'visual_preference', 'emotional_effect', 'start_sec', 'end_sec', 'retrieval_text', 'CreatedAt', 'UpdatedAt']),
    resource: resource ? picked(resource, ['ID', 'id', 'name', 'mime_type', 'type', 'url', 'size']) : undefined,
    group: group ? picked(group, ['ID', 'id', 'title', 'summary', 'analysis_status', 'cut_strategy']) : undefined,
    execution_details: isRecord(item.execution_details) ? picked(item.execution_details, ['duration_sec', 'resolution', 'aspect_ratio', 'coverage_role', 'difficulty', 'blocking', 'requirements']) : undefined,
    search_index: isRecord(item.search_index) ? picked(item.search_index, ['natural_language_queries', 'tags', 'visual_facets', 'narrative_facets', 'emotion_facets', 'pattern_facets', 'production_facets']) : undefined,
  }
}

function picked(record: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of keys) {
    if (record[key] !== undefined) result[key] = truncateText(record[key])
  }
  return result
}

function truncateText(value: unknown): unknown {
  if (typeof value !== 'string') return value
  return value.length > 1200 ? `${value.slice(0, 1200)}...` : value
}

function shotReferenceId(item: unknown): number | undefined {
  if (!isRecord(item)) return undefined
  return typeof item.ID === 'number' ? item.ID : typeof item.id === 'number' ? item.id : undefined
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  return typeof record[key] === 'number' && Number.isFinite(record[key]) ? record[key] : undefined
}

function numericParam(value: string | null): number | undefined {
  if (!value?.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function booleanParam(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return undefined
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}
