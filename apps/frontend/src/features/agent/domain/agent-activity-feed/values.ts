import { isRecord } from '@/shared/domain/jsonValue'

export function recordValue(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

export function arrayValue(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function compactLines(lines: Array<string | undefined>): string[] {
  return lines.filter((line): line is string => !!line?.trim())
}

export function planTasksSummary(value: Record<string, unknown> | undefined): string | undefined {
  const tasks = arrayValue(value?.tasks) ?? arrayValue(value?.items)
  if (!tasks?.length) return undefined
  const counts = tasks.reduce<Record<string, number>>((acc, task) => {
    const status = stringValue(recordValue(task)?.status) ?? 'unknown'
    acc[status] = (acc[status] ?? 0) + 1
    return acc
  }, {})
  const parts = compactLines([
    counts.completed ? `已完成 ${counts.completed}` : undefined,
    counts.in_progress ? `进行中 ${counts.in_progress}` : undefined,
    counts.pending ? `待处理 ${counts.pending}` : undefined,
  ])
  return `任务：${tasks.length} 项${parts.length ? `（${parts.join('，')}）` : ''}`
}

export function idFromAliases(value: Record<string, unknown> | undefined, keys: string[]): number | undefined {
  for (const key of keys) {
    const id = numberValue(value?.[key])
    if (id !== undefined) return id
  }
  return undefined
}

export function timestamp(value: string | undefined) {
  if (!value) return 0
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : 0
}
