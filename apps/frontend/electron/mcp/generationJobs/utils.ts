export {
  clampNumber,
  getOptionalNumeric,
  getOptionalString,
  numericValue,
} from '../paramValues'
import { numericValue } from '../paramValues'

export function getRequiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || value.length === 0) throw new Error(key + ' is required')
  return value
}

export function getRequiredNumber(args: Record<string, unknown>, key: string): number {
  const value = args[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(key + ' is required')
  return value
}

export function getNumberArray(value: unknown): number[] {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []
  return rawItems
    .map((item) => typeof item === 'number' ? item : typeof item === 'string' ? Number(item) : NaN)
    .filter((item) => Number.isInteger(item) && item > 0)
}

export function uniquePositiveNumberArray(value: unknown[]): number[] {
  const seen = new Set<number>()
  const out: number[] = []
  for (const item of value) {
    const parsed = numericValue(item)
    if (parsed === undefined || !Number.isInteger(parsed) || parsed <= 0 || seen.has(parsed)) continue
    seen.add(parsed)
    out.push(parsed)
  }
  return out
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
