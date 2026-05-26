import { isRecord } from '../valueUtils'

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function getJobId(job: unknown): number | undefined {
  if (!isRecord(job)) return undefined
  const id = Number(job.ID ?? job.id)
  return Number.isFinite(id) && id > 0 ? id : undefined
}

export function uniquePositiveNumbers(values: unknown[]): number[] {
  const seen = new Set<number>()
  const ids: number[] = []
  for (const value of values) {
    const id = Number(value)
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}
