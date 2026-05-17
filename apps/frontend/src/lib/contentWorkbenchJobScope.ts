import { isRecord } from '@/lib/jsonValue'

export interface ContentWorkbenchJobScopeLike {
  ID?: number
  id?: number | string
  title?: string
  prompt?: string
  request_context?: string
  requestContext?: string
  extra_params?: string
  extraParams?: string
  input_resource_id?: number | null
  inputResourceId?: number | null
  input_resource_ids?: string
  inputResourceIds?: string | Array<number | string>
}

export function pickContentWorkbenchRelevantJobs<T extends ContentWorkbenchJobScopeLike>(input: {
  jobs: T[]
  contentUnitId?: number | null
  contentUnitTitle?: string
  resourceIds?: Array<number | null | undefined>
}): T[] {
  const contentUnitId = positiveInteger(input.contentUnitId)
  if (contentUnitId <= 0) return []
  const resourceIds = new Set((input.resourceIds ?? []).map(positiveInteger).filter((id) => id > 0))
  const title = normalizeText(input.contentUnitTitle)
  return input.jobs.filter((job) => {
    if (jobReferencesContentUnit(job, contentUnitId)) return true
    if (resourceIds.size > 0 && jobResourceIds(job).some((id) => resourceIds.has(id))) return true
    if (title.length >= 2) {
      const haystack = normalizeText([job.title, job.prompt].filter(Boolean).join(' '))
      if (haystack.includes(title)) return true
    }
    return false
  })
}

function jobReferencesContentUnit(job: ContentWorkbenchJobScopeLike, contentUnitId: number) {
  return [job.request_context, job.requestContext, job.extra_params, job.extraParams]
    .map(parseJsonRecord)
    .some((value) => value ? recordReferencesContentUnit(value, contentUnitId) : false)
}

function recordReferencesContentUnit(value: unknown, contentUnitId: number): boolean {
  if (Array.isArray(value)) return value.some((item) => recordReferencesContentUnit(item, contentUnitId))
  if (!isRecord(value)) return false
  const directId = numericRecordField(value, ['content_unit_id', 'contentUnitId', 'contentUnitID'])
  if (directId === contentUnitId) return true
  const refId = numericRecordField(value, ['ref_id', 'refId', 'entityId', 'targetId'])
  const refType = normalizeText(firstRecordField(value, ['ref_type', 'refType', 'entityType', 'targetType']))
  if (refId === contentUnitId && refType === 'content_unit') return true
  return Object.values(value).some((item) => recordReferencesContentUnit(item, contentUnitId))
}

function jobResourceIds(job: ContentWorkbenchJobScopeLike) {
  const ids = [
    positiveInteger(job.input_resource_id),
    positiveInteger(job.inputResourceId),
    ...parseResourceIds(job.input_resource_ids),
    ...parseResourceIds(job.inputResourceIds),
  ].filter((id) => id > 0)
  return Array.from(new Set(ids))
}

function parseResourceIds(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(positiveInteger).filter((id) => id > 0)
  if (typeof value === 'string' && value.trim()) {
    const parsed = parseJson(value)
    if (Array.isArray(parsed)) return parsed.map(positiveInteger).filter((id) => id > 0)
    return value.split(',').map(positiveInteger).filter((id) => id > 0)
  }
  return []
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  const parsed = parseJson(value)
  return isRecord(parsed) ? parsed : null
}

function parseJson(value: unknown): unknown {
  if (isRecord(value) || Array.isArray(value)) return value
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function numericRecordField(record: Record<string, unknown>, keys: string[]) {
  return positiveInteger(firstRecordField(record, keys))
}

function firstRecordField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key]
  }
  return undefined
}

function positiveInteger(value: unknown) {
  return Math.max(0, Math.trunc(Number(value) || 0))
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}
