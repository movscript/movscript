export function copyFiniteNumber(out: Record<string, unknown>, source: Record<string, unknown>, sourceKey: string, targetKey = sourceKey): void {
  const value = source[sourceKey]
  if (typeof value === 'number' && Number.isFinite(value)) out[targetKey] = value
}

export function isJSONScalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

export function numericModelField(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key]
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

export function stringModelField(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function integerModelField(source: Record<string, unknown>, key: string, min: number, fallback: number): number {
  const value = source[key]
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isInteger(parsed) || parsed < min) return fallback
  return parsed
}

export function stringArrayModelField(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.flatMap((item) => (
    typeof item === 'string' && item.trim() ? [item.trim()] : []
  ))))
}
