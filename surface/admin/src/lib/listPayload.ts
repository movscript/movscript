export function readListPayload<T>(raw: unknown, keys: string[] = ['items', 'records', 'data']): T[] {
  if (Array.isArray(raw)) return raw as T[]
  if (!raw || typeof raw !== 'object') return []

  const record = raw as Record<string, unknown>
  for (const key of keys) {
    const value = record[key]
    if (Array.isArray(value)) return value as T[]
  }
  return []
}

export function readRecordPayload(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
}

export function readNumberPayload(raw: unknown, fallback = 0): number {
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

export function readPaginatedPayload<T>(
  raw: unknown,
  options: { itemKeys?: string[]; defaultPageSize?: number } = {},
): { total: number; items: T[]; page: number; page_size: number } {
  const record = readRecordPayload(raw)
  const items = readListPayload<T>(raw, options.itemKeys)
  const pageSize = readNumberPayload(record.page_size, options.defaultPageSize ?? items.length)
  return {
    items,
    total: readNumberPayload(record.total, items.length),
    page: readNumberPayload(record.page, 1),
    page_size: pageSize > 0 ? pageSize : options.defaultPageSize ?? 1,
  }
}
