import type { JSONValue } from './types.js'

export function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function isJSONRecord(value: unknown): value is Record<string, JSONValue> {
  return isRecord(value) && Object.values(value).every(isJSONValue)
}

export function isJSONValue(value: unknown): value is JSONValue {
  if (value === null) return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.every(isJSONValue)
  return isJSONRecord(value)
}

export function cloneJSONValue<T extends JSONValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
