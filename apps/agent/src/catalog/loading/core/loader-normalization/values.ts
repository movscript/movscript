import { isJSONValue, isRecord } from '../../../../shared/json/jsonValue.js'
import type { JSONValue } from '../../../../shared/protocol/types.js'

export function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

export function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())))
}

export function runRoleArray(value: unknown): Array<'planner' | 'worker'> {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is 'planner' | 'worker' => item === 'planner' || item === 'worker')))
}

export function stringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined
  const entries = Object.entries(value).flatMap(([key, item]) => typeof item === 'string' && item.trim() ? [[key, item.trim()] as const] : [])
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

export function jsonRecord(value: unknown): Record<string, JSONValue> | undefined {
  if (!isRecord(value)) return undefined
  const entries = Object.entries(value).filter((entry): entry is [string, JSONValue] => isJSONValue(entry[1]))
  return entries.length === Object.keys(value).length ? Object.fromEntries(entries) : undefined
}

export function positiveNumber(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number > 0 ? number : undefined
}
