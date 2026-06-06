import { backendGet } from '../../../../backend/node/client.js'
import { clampNumber, getOptionalNumeric, getOptionalString } from '../../../tools/shared/params.js'
import { isRecord } from '../../../tools/shared/record.js'

export async function listExternalResourceSources(args: Record<string, unknown>): Promise<unknown> {
  const includeDisabled = booleanParam(args.include_disabled) ?? booleanParam(args.includeDisabled) ?? false
  const sources = await fetchExternalResourceSources()
  const filtered = includeDisabled ? sources : sources.filter(source => source.is_enabled !== false)
  return {
    source: 'movscript_external_resource_sources',
    count: filtered.length,
    items: filtered.map(summarizeExternalResourceSource),
    usage: 'Pass an enabled source ID to movscript_external_resource_search.source_id, or omit source_id to use the first enabled source.',
  }
}

export async function searchExternalResources(args: Record<string, unknown>): Promise<unknown> {
  const sourceId = getOptionalNumeric(args, 'source_id')
    ?? getOptionalNumeric(args, 'sourceId')
    ?? (await defaultExternalResourceSourceId())
  const query = getOptionalString(args, 'query') ?? getOptionalString(args, 'q')
  if (!query) throw new Error('query is required')
  if (!sourceId) throw new Error('No enabled external resource source is configured')
  const mediaType = getOptionalString(args, 'media_type') ?? getOptionalString(args, 'mediaType')
  const orientation = getOptionalString(args, 'orientation')
  const page = Math.floor(clampNumber(getOptionalNumeric(args, 'page') ?? 1, 1, 10000))
  const pageSize = Math.floor(clampNumber(
    getOptionalNumeric(args, 'page_size')
      ?? getOptionalNumeric(args, 'pageSize')
      ?? getOptionalNumeric(args, 'limit')
      ?? 20,
    1,
    80,
  ))
  const result = await fetchExternalResourceSearch({ sourceId, query, mediaType, orientation, page, pageSize })
  const items = Array.isArray(result.items) ? result.items : []
  return {
    source: 'movscript_external_resources',
    source_id: sourceId,
    query,
    ...(mediaType ? { media_type: mediaType } : {}),
    ...(orientation ? { orientation } : {}),
    page: numberField(result, 'page') ?? page,
    pageSize: numberField(result, 'page_size') ?? pageSize,
    total: numberField(result, 'total') ?? items.length,
    count: items.length,
    provider: typeof result.provider === 'string' ? result.provider : undefined,
    source_name: typeof result.source_name === 'string' ? result.source_name : undefined,
    next_page: typeof result.next_page === 'string' ? result.next_page : undefined,
    items: items.map(summarizeExternalResourceItem),
    usage: 'These are external search results, not MovScript RawResources. Import through MovScript before using them as generation input_resource_ids.',
  }
}

export async function readExternalResources(uri: string): Promise<unknown> {
  const parsed = parseExternalResourcesURI(uri)
  if (!parsed) throw new Error(`Unsupported external resource URI: ${uri}`)
  if (!parsed.query) return listExternalResourceSources({})
  return searchExternalResources(parsed)
}

export function isExternalResourcesURI(uri: string): boolean {
  return parseExternalResourcesURI(uri) !== null
}

function parseExternalResourcesURI(uri: string): Record<string, unknown> | null {
  const match = uri.match(/^movscript:\/\/external-resources(?:\?(.*))?$/)
  if (!match) return null
  const params = new URLSearchParams(match[1] ?? '')
  return {
    ...(params.get('query') || params.get('q') ? { query: params.get('query') ?? params.get('q') ?? '' } : {}),
    ...(numericParam(params.get('source_id') ?? params.get('sourceId')) !== undefined
      ? { source_id: numericParam(params.get('source_id') ?? params.get('sourceId')) }
      : {}),
    ...(params.get('media_type') || params.get('mediaType') ? { media_type: params.get('media_type') ?? params.get('mediaType') ?? '' } : {}),
    ...(params.get('orientation') ? { orientation: params.get('orientation') ?? '' } : {}),
    ...(numericParam(params.get('page')) !== undefined ? { page: numericParam(params.get('page')) } : {}),
    ...(numericParam(params.get('page_size') ?? params.get('pageSize') ?? params.get('limit')) !== undefined
      ? { page_size: numericParam(params.get('page_size') ?? params.get('pageSize') ?? params.get('limit')) }
      : {}),
  }
}

async function defaultExternalResourceSourceId(): Promise<number | undefined> {
  const sources = await fetchExternalResourceSources()
  const enabled = sources.find(source => source.is_enabled !== false)
  return numericField(enabled, 'ID') ?? numericField(enabled, 'id')
}

async function fetchExternalResourceSources(): Promise<Array<Record<string, unknown>>> {
  const data = await backendGet('/external-resource-sources')
  return Array.isArray(data) ? data.filter(isRecord) : []
}

async function fetchExternalResourceSearch(input: {
  sourceId: number
  query: string
  mediaType?: string
  orientation?: string
  page: number
  pageSize: number
}): Promise<Record<string, unknown>> {
  const params = new URLSearchParams()
  params.set('source_id', String(input.sourceId))
  params.set('q', input.query)
  params.set('page', String(input.page))
  params.set('page_size', String(input.pageSize))
  if (input.mediaType?.trim()) params.set('media_type', input.mediaType.trim())
  if (input.orientation?.trim() && input.orientation !== 'all') params.set('orientation', input.orientation.trim())
  const data = await backendGet(`/external-resources/search?${params.toString()}`)
  return isRecord(data) ? data : { items: [] }
}

function summarizeExternalResourceSource(item: Record<string, unknown>): Record<string, unknown> {
  return picked(item, ['ID', 'id', 'name', 'provider_key', 'priority', 'is_enabled', 'CreatedAt', 'UpdatedAt'])
}

function summarizeExternalResourceItem(item: unknown): unknown {
  if (!isRecord(item)) return item
  return picked(item, ['provider_key', 'external_id', 'media_type', 'title', 'description', 'thumbnail_url', 'preview_url', 'source_url', 'width', 'height', 'duration_seconds', 'author_name', 'author_url', 'attribution_text', 'license_label'])
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

function numericField(record: Record<string, unknown> | undefined, key: string): number | undefined {
  if (!record) return undefined
  return typeof record[key] === 'number' && Number.isFinite(record[key]) ? record[key] : undefined
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
