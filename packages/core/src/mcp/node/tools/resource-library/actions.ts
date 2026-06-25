import { backendGet } from '../../../../backend/node/client.js'
import { getMovScriptBackendAPIBaseURL } from '../../../../backend/node/runtime.js'
import { clampNumber, getOptionalNumeric, getOptionalString } from '../../../tools/shared/params.js'
import { isRecord } from '../../../tools/shared/record.js'
import {
  createResourceDetailSurface,
  createResourceLibrarySurface,
} from '../surfaces.js'

interface ResourceLibraryRequest {
  query?: string
  type?: string
  scope?: string
  folderId?: string
  page?: number
  pageSize?: number
}

export async function queryResourceLibrary(args: Record<string, unknown>): Promise<unknown> {
  const id = getOptionalNumeric(args, 'resource_id')
    ?? getOptionalNumeric(args, 'resourceId')
    ?? getOptionalNumeric(args, 'id')
  const includeFull = booleanParam(args.include_full) ?? booleanParam(args.includeFull) ?? false
  const query = getOptionalString(args, 'query') ?? getOptionalString(args, 'q') ?? ''
  const type = getOptionalString(args, 'type') ?? getOptionalString(args, 'media_type')
  const scope = getOptionalString(args, 'scope')
  const folderId = getOptionalString(args, 'folder_id') ?? getOptionalString(args, 'folderId')
  const page = Math.floor(clampNumber(getOptionalNumeric(args, 'page') ?? 1, 1, 10000))
  const pageSize = Math.floor(clampNumber(
    getOptionalNumeric(args, 'page_size')
      ?? getOptionalNumeric(args, 'pageSize')
      ?? getOptionalNumeric(args, 'limit')
      ?? 20,
    1,
    100,
  ))
  const pageData = await fetchResourceLibraryPage({ query, type, scope, folderId, page, pageSize })
  const items = resourceItems(pageData)
  const summarized = items.map((item: unknown) => summarizeRawResource(item, { includeFull }))
  const filtered = id === undefined ? summarized : summarized.filter((item: unknown) => rawResourceId(item) === id)

  return {
    source: 'movscript_resource_library',
    query,
    ...(type ? { type } : {}),
    ...(scope ? { scope } : {}),
    ...(folderId ? { folder_id: folderId } : {}),
    page: numberField(pageData, 'page') ?? page,
    pageSize: numberField(pageData, 'page_size') ?? pageSize,
    total: numberField(pageData, 'total') ?? filtered.length,
    count: filtered.length,
    items: filtered,
    usage: 'Use RawResource.ID values as input_resource_ids or reference_resource_ids for MovScript generation tools.',
    ...(id !== undefined && filtered.length > 0 ? { surface: createResourceDetailSurface(args, id) } : {}),
    ...(id !== undefined && filtered.length === 0 ? { warning: `resource_id ${id} was not found on the requested page` } : {}),
  }
}

export function openResourceLibrary(args: Record<string, unknown>): unknown {
  const surface = createResourceLibrarySurface(args)

  return {
    source: 'movscript_resource_library',
    ...surface,
    backend_api_base_url: getMovScriptBackendAPIBaseURL(),
  }
}

export async function readResourceLibrary(uri: string): Promise<unknown> {
  const parsed = parseResourceLibraryURI(uri)
  if (!parsed) throw new Error(`Unsupported MovScript resource library URI: ${uri}`)
  return queryResourceLibrary({
    ...parsed,
    include_full: true,
  })
}

export function isResourceLibraryURI(uri: string): boolean {
  return parseResourceLibraryURI(uri) !== null
}

function parseResourceLibraryURI(uri: string): Record<string, unknown> | null {
  const match = uri.match(/^movscript:\/\/resource-library(?:\/(\d+))?(?:\?(.*))?$/)
  if (!match) return null
  const params = new URLSearchParams(match[2] ?? '')
  return {
    ...(match[1] ? { resource_id: Number(match[1]) } : {}),
    ...(params.get('query') || params.get('q') ? { query: params.get('query') ?? params.get('q') ?? '' } : {}),
    ...(params.get('type') || params.get('media_type') ? { type: params.get('type') ?? params.get('media_type') ?? '' } : {}),
    ...(params.get('scope') ? { scope: params.get('scope') ?? '' } : {}),
    ...(params.get('folder_id') || params.get('folderId') ? { folder_id: params.get('folder_id') ?? params.get('folderId') ?? '' } : {}),
    ...(numericParam(params.get('page')) !== undefined ? { page: numericParam(params.get('page')) } : {}),
    ...(numericParam(params.get('page_size') ?? params.get('pageSize') ?? params.get('limit')) !== undefined
      ? { page_size: numericParam(params.get('page_size') ?? params.get('pageSize') ?? params.get('limit')) }
      : {}),
  }
}

async function fetchResourceLibraryPage(input: ResourceLibraryRequest): Promise<Record<string, unknown> | unknown[]> {
  const params = new URLSearchParams()
  params.set('page', String(input.page ?? 1))
  params.set('page_size', String(input.pageSize ?? 20))
  if (input.query?.trim()) params.set('q', input.query.trim())
  if (input.type?.trim()) params.set('type', input.type.trim())
  if (input.scope?.trim()) params.set('scope', input.scope.trim())
  if (input.folderId?.trim()) params.set('folder_id', input.folderId.trim())
  const data = await backendGet(`/resources?${params.toString()}`)
  return isRecord(data) || Array.isArray(data) ? data : { items: [] }
}

function summarizeRawResource(item: unknown, options: { includeFull: boolean }): unknown {
  if (!isRecord(item)) return item
  if (options.includeFull) return item
  return picked(item, ['ID', 'id', 'name', 'type', 'mime_type', 'size', 'url', 'direct_url', 'folder_id', 'owner_id', 'org_id', 'CreatedAt', 'UpdatedAt'])
}

function resourceItems(pageData: Record<string, unknown> | unknown[]): unknown[] {
  if (Array.isArray(pageData)) return pageData
  return Array.isArray(pageData.items) ? pageData.items : []
}

function picked(record: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of keys) {
    if (record[key] !== undefined) result[key] = record[key]
  }
  return result
}

function rawResourceId(item: unknown): number | undefined {
  if (!isRecord(item)) return undefined
  return typeof item.ID === 'number' ? item.ID : typeof item.id === 'number' ? item.id : undefined
}

function numberField(record: Record<string, unknown> | unknown[], key: string): number | undefined {
  if (!isRecord(record)) return undefined
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
