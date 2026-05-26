import { isRecord } from '../valueUtils'
export { backendList } from '../backendList'
export {
  numericValue,
  textOrUndefined,
} from '../paramValues'
import {
  textOrUndefined,
} from '../paramValues'

export function getRequiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || !value.trim()) throw new Error(key + ' is required')
  return value.trim()
}

export function normalizedStringField(item: unknown, key: string): string | undefined {
  if (!isRecord(item)) return undefined
  return textOrUndefined(item[key])
}

export function truncateLongText(value: unknown): unknown {
  if (typeof value !== 'string') return value
  return value.length > 1200 ? value.slice(0, 1200) + '...' : value
}
