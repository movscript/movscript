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

function numericValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}
