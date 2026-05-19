export function getRequiredPositiveIntegerAliasParam(args: Record<string, unknown>, keys: string[], label: string): number {
  const values: number[] = []
  for (const key of keys) {
    if (args[key] === undefined) continue
    const value = numericValue(args[key])
    if (value === undefined || !Number.isInteger(value) || value <= 0) {
      throw new Error(`${label} must be a positive integer`)
    }
    values.push(value)
  }
  if (values.length === 0) throw new Error(`${label} is required`)
  const first = values[0]
  if (!values.every((value) => value === first)) throw new Error(`${label} aliases must match`)
  return first
}

export function getRequiredPositiveIntegerAliasParams(args: Record<string, unknown>, keys: string[], label: string): number[] {
  const values: number[][] = []
  for (const key of keys) {
    if (args[key] === undefined) continue
    const value = numericValues(args[key])
    if (value === undefined || value.length === 0 || value.some((item) => !Number.isInteger(item) || item <= 0)) {
      throw new Error(`${label} must be a positive integer or positive integer array`)
    }
    values.push(value)
  }
  if (values.length === 0) throw new Error(`${label} is required`)
  const first = values[0]
  if (!values.every((value) => sameNumberArray(value, first))) throw new Error(`${label} aliases must match`)
  return first
}

function numericValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function numericValues(value: unknown): number[] | undefined {
  if (Array.isArray(value)) {
    const values = value.map(numericValue)
    return values.every((item): item is number => item !== undefined) ? values : undefined
  }
  const single = numericValue(value)
  return single === undefined ? undefined : [single]
}

function sameNumberArray(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}
