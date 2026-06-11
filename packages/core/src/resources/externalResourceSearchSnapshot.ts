export type ExternalMediaFilter = 'image' | 'video'
export type ExternalOrientationFilter = 'all' | 'landscape' | 'portrait' | 'square'

export interface ExternalResourceSearchResultLike {
  items: readonly unknown[]
}

export interface ExternalResourceSearchSnapshot<
  TResult extends ExternalResourceSearchResultLike = ExternalResourceSearchResultLike,
> {
  sourceId?: number
  query: string
  submittedQuery: string
  mediaTypes: ExternalMediaFilter[]
  orientation: ExternalOrientationFilter
  page: number
  result: TResult
}

export interface ExternalResourceSearchInitialDataInput {
  sourceId?: number
  submittedQuery: string
  mediaTypeKey: string
  orientation: ExternalOrientationFilter
  page: number
}

export function externalResourceSearchInitialData<
  TResult extends ExternalResourceSearchResultLike,
>(
  snapshot: ExternalResourceSearchSnapshot<TResult> | null,
  current: ExternalResourceSearchInitialDataInput,
): TResult | undefined {
  if (!snapshot || !current.sourceId) return undefined
  if (snapshot.sourceId && snapshot.sourceId !== current.sourceId) return undefined
  if (snapshot.submittedQuery !== current.submittedQuery.trim()) return undefined
  if (snapshot.mediaTypes.join('|') !== current.mediaTypeKey) return undefined
  if (snapshot.orientation !== current.orientation) return undefined
  if (snapshot.page !== current.page) return undefined
  return snapshot.result
}

export function parseExternalResourceSearchSnapshot(
  raw: string | null | undefined,
): ExternalResourceSearchSnapshot | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ExternalResourceSearchSnapshot>
    const submittedQuery = typeof parsed.submittedQuery === 'string' ? parsed.submittedQuery.trim() : ''
    if (!submittedQuery || !hasExternalSearchResultItems(parsed.result)) return null
    return {
      sourceId: typeof parsed.sourceId === 'number' ? parsed.sourceId : undefined,
      query: typeof parsed.query === 'string' && parsed.query.trim() ? parsed.query.trim() : submittedQuery,
      submittedQuery,
      mediaTypes: normalizeExternalMediaTypes(parsed.mediaTypes),
      orientation: normalizeExternalOrientation(parsed.orientation),
      page: normalizeExternalSnapshotPage(parsed.page),
      result: parsed.result,
    }
  } catch {
    return null
  }
}

export function normalizeExternalMediaTypes(value: unknown): ExternalMediaFilter[] {
  const input = Array.isArray(value) ? value : []
  const output = input.filter((item): item is ExternalMediaFilter => item === 'image' || item === 'video')
  return output.length > 0 ? (Array.from(new Set(output)).sort() as ExternalMediaFilter[]) : ['image', 'video']
}

export function normalizeExternalOrientation(value: unknown): ExternalOrientationFilter {
  return value === 'landscape' || value === 'portrait' || value === 'square' ? value : 'all'
}

export function normalizeExternalSnapshotPage(value: unknown) {
  const page = Number(value)
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
}

function hasExternalSearchResultItems(value: unknown): value is ExternalResourceSearchResultLike {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items))
}
