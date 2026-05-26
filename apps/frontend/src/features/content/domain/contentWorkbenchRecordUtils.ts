export type OrderedWorkbenchRecord = {
  ID: number
  order?: number
  title?: unknown
  name?: unknown
  label?: unknown
  slot_key?: unknown
  kind?: unknown
}

export function firstText(...values: Array<unknown>) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

export function normalizeEntityTitleKey(value: unknown) {
  return firstText(value).toLowerCase().replace(/\s+/g, '')
}

export function dedupeRecords<T extends { ID: number }>(records: T[]): T[] {
  const seen = new Set<number>()
  return records.filter((record) => {
    if (seen.has(record.ID)) return false
    seen.add(record.ID)
    return true
  })
}

export function titleOfRecord(record?: OrderedWorkbenchRecord | null) {
  if (!record) return '未选择'
  return firstText(record.title, record.name, record.label, record.slot_key, `${record.kind || '记录'} #${record.ID}`)
}

export function numberOf(value: unknown) {
  const next = Number(value)
  return Number.isFinite(next) ? next : 0
}

export function formatDuration(value?: number) {
  const next = Number(value)
  if (!Number.isFinite(next) || next <= 0) return '未设时长'
  return `${Math.round(next)}s`
}

export function byOrder<T extends { order?: number; ID: number }>(a: T, b: T) {
  const ao = typeof a.order === 'number' ? a.order : a.ID
  const bo = typeof b.order === 'number' ? b.order : b.ID
  return ao - bo
}

export function clampProgress(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}
