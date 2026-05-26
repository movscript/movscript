import {
  clampNumber,
  numericValue,
  textOrUndefined,
} from '../paramValues'
import { isRecord } from '../valueUtils'
export {
  getOptionalNumeric,
  getOptionalString,
  numericValue,
} from '../paramValues'
export { entityId } from '../toolValues'

export function normalizeListLimit(value: unknown, fallback: number, max: number): number {
  const parsed = numericValue(value)
  if (parsed === undefined) return fallback
  return clampNumber(Math.floor(parsed), 1, max)
}

export function limitItems<T>(items: T[], limit: number): T[] {
  return items.slice(0, limit)
}

export function normalizedStringField(item: unknown, key: string): string | undefined {
  if (!isRecord(item)) return undefined
  return textOrUndefined(item[key])
}

export function numberSetArg(value: unknown, extra?: number): Set<number> {
  const out = new Set<number>()
  if (extra !== undefined) out.add(extra)
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = numericValue(item)
      if (parsed !== undefined) out.add(parsed)
    }
  }
  return out
}

export function recordMatchesQuery(item: unknown, query: string, fields: string[]): boolean {
  if (!isRecord(item)) return false
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return fields.some((field) => {
    const value = item[field]
    if (value === undefined || value === null) return false
    return String(value).toLowerCase().includes(needle)
  })
}

export function compactObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ''))
}

export function parseMetadataRecord(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) return value
  if (typeof value !== 'string' || value.trim().length === 0) return undefined
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}
