import type { JSONValue } from './types.js'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function isJSONRecord(value: unknown): value is Record<string, JSONValue> {
  return isRecord(value) && Object.values(value).every(isJSONValue)
}

export function isJSONValue(value: unknown): value is JSONValue {
  if (value === null) return true
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.every(isJSONValue)
  return isJSONRecord(value)
}
