import type { MCPJSONValue } from './types.js'
import { isRecord } from '../tools/shared/record.js'

export function toMCPJSONValue(value: unknown): MCPJSONValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value as MCPJSONValue
  if (Array.isArray(value)) return value.map(toMCPJSONValue)
  if (!isRecord(value)) return String(value)
  const obj: Record<string, MCPJSONValue> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) obj[key] = toMCPJSONValue(item)
  }
  return obj
}
