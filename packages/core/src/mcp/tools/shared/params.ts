export function getOptionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  return textOrUndefined(value)
}

export function getOptionalNumeric(args: Record<string, unknown>, key: string): number | undefined {
  return numericValue(args[key])
}

export function numericValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

export function numericValues(value: unknown): number[] | undefined {
  if (Array.isArray(value)) {
    const values = value.map(numericValue)
    return values.every((item): item is number => item !== undefined) ? values : undefined
  }
  const single = numericValue(value)
  return single === undefined ? undefined : [single]
}

export function textOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
