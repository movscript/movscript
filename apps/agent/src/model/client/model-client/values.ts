export function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function numericValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function tryParseJSON(value: string): { ok: true; value: unknown } | { ok: false } {
  if (!value.trim()) return { ok: false }
  try {
    return { ok: true, value: JSON.parse(value) }
  } catch {
    return { ok: false }
  }
}
