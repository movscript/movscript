export function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))).sort()
}

export function firstNumber(value: string): number {
  return Number(value.match(/\d+/)?.[0] ?? 0)
}

export function formatInteger(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

export function slashNumbers(value: string): [number, number] {
  const match = value.match(/(\d+)\s*\/\s*(\d+)/)
  return [Number(match?.[1] ?? 0), Number(match?.[2] ?? 0)]
}

export function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

export function arrayValue(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

export function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()))).sort()
}
