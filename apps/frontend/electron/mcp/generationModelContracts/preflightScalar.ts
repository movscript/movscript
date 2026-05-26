export function numericParamValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

export function scalarValuesEqual(expected: string | number | boolean, actual: unknown): boolean {
  if (typeof expected === 'number') return numericParamValue(actual) === expected
  return expected === actual
}

export function paramHasValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false
  if (typeof value === 'boolean') return value
  const number = numericParamValue(value)
  return number === undefined || number !== 0
}
