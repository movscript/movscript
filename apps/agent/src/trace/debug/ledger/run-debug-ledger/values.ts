const DEFAULT_PREVIEW_CHARS = 400

export function previewJSON(value: unknown): string {
  try {
    return previewText(JSON.stringify(value), DEFAULT_PREVIEW_CHARS)
  } catch {
    return previewText(String(value), DEFAULT_PREVIEW_CHARS)
  }
}

export function previewText(value: string, maxChars = DEFAULT_PREVIEW_CHARS): string {
  if (value.length <= maxChars) return value
  return `${value.slice(0, Math.max(0, maxChars - 24))}... [truncated]`
}

export function jsonLength(value: unknown): number {
  try {
    return JSON.stringify(value).length
  } catch {
    return String(value).length
  }
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
}

export function arrayValue(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined
}

export function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

export function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)))
}

export function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const value of values) {
    const id = key(value)
    if (seen.has(id)) continue
    seen.add(id)
    out.push(value)
  }
  return out
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
