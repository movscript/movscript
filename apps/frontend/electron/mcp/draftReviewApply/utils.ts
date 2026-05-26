import { isRecord } from '../valueUtils'

export function getObjectParamValue(args: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = args[key]
  if (!isRecord(value)) throw new Error(key + ' is required')
  return value
}

export function getObjectValue(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(label + ' is required')
  return value
}

export function toMCPJSONValue(value: unknown): unknown {
  if (value === undefined) return null
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(toMCPJSONValue)
  if (!isRecord(value)) return String(value)
  const obj: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) obj[key] = toMCPJSONValue(item)
  return obj
}
