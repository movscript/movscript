export { backendList } from '../backendList'
export {
  clampNumber,
  getOptionalNumeric as getOptionalNumber,
  getOptionalString,
  numericValue,
  textOrUndefined,
} from '../paramValues'
import {
  numericValue,
} from '../paramValues'

export function normalizeListLimit(value: unknown, fallback: number, max: number): number {
  const parsed = numericValue(value)
  if (!parsed) return fallback
  return Math.max(1, Math.min(max, Math.floor(parsed)))
}
