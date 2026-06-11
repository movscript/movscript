export type MovScriptJsonChangeOperation =
  | 'added'
  | 'removed'
  | 'replaced'
  | 'moved'
  | 'reordered'

export interface MovScriptJsonChange {
  path: string
  operation: MovScriptJsonChangeOperation
  oldValue?: unknown
  newValue?: unknown
  itemKey?: string
  oldIndex?: number
  newIndex?: number
}

export function diffMovScriptJsonValues(before: unknown, after: unknown): MovScriptJsonChange[] {
  return diffJsonValueAtPointer(before, after, '')
}

export function jsonPointerToFieldPath(pointer: string): string {
  if (pointer === '') return '*'
  return pointer
    .split('/')
    .slice(1)
    .map(unescapeJsonPointerSegment)
    .join('.')
}

export function valueAtJsonPointer(value: unknown, pointer: string): unknown {
  if (pointer === '') return value
  return pointer.split('/').slice(1).reduce<unknown>((current, segment) => {
    const key = unescapeJsonPointerSegment(segment)
    if (Array.isArray(current)) {
      const index = Number(key)
      return Number.isInteger(index) ? current[index] : undefined
    }
    return isRecord(current) ? current[key] : undefined
  }, value)
}

function diffJsonValueAtPointer(before: unknown, after: unknown, pointer: string): MovScriptJsonChange[] {
  if (jsonValueEquals(before, after)) return []
  if (Array.isArray(before) && Array.isArray(after)) return diffJsonArrayAtPointer(before, after, pointer)
  if (isRecord(before) && isRecord(after)) return diffJsonObjectAtPointer(before, after, pointer)
  if (before === undefined) return [{ path: pointer, operation: 'added', newValue: after }]
  if (after === undefined) return [{ path: pointer, operation: 'removed', oldValue: before }]
  return [{ path: pointer, operation: 'replaced', oldValue: before, newValue: after }]
}

function diffJsonObjectAtPointer(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  pointer: string,
): MovScriptJsonChange[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
  return keys.flatMap((key) => {
    const childPointer = appendJsonPointerSegment(pointer, key)
    if (!(key in before)) return [{ path: childPointer, operation: 'added' as const, newValue: after[key] }]
    if (!(key in after)) return [{ path: childPointer, operation: 'removed' as const, oldValue: before[key] }]
    return diffJsonValueAtPointer(before[key], after[key], childPointer)
  })
}

function diffJsonArrayAtPointer(
  before: unknown[],
  after: unknown[],
  pointer: string,
): MovScriptJsonChange[] {
  const beforeKeys = before.map(stableArrayItemKey)
  const afterKeys = after.map(stableArrayItemKey)
  const canTrackItems = beforeKeys.every((key): key is string => key !== undefined)
    && afterKeys.every((key): key is string => key !== undefined)
    && new Set(beforeKeys).size === beforeKeys.length
    && new Set(afterKeys).size === afterKeys.length

  if (canTrackItems) {
    return diffTrackableJsonArrayAtPointer(before, after, beforeKeys, afterKeys, pointer)
  }

  const length = Math.max(before.length, after.length)
  const changes: MovScriptJsonChange[] = []
  for (let index = 0; index < length; index += 1) {
    const childPointer = appendJsonPointerSegment(pointer, String(index))
    if (index >= before.length) {
      changes.push({ path: childPointer, operation: 'added', newValue: after[index] })
    } else if (index >= after.length) {
      changes.push({ path: childPointer, operation: 'removed', oldValue: before[index] })
    } else {
      changes.push(...diffJsonValueAtPointer(before[index], after[index], childPointer))
    }
  }
  return changes
}

function diffTrackableJsonArrayAtPointer(
  before: unknown[],
  after: unknown[],
  beforeKeys: string[],
  afterKeys: string[],
  pointer: string,
): MovScriptJsonChange[] {
  const changes: MovScriptJsonChange[] = []
  const beforeIndexByKey = new Map(beforeKeys.map((key, index) => [key, index]))
  const afterIndexByKey = new Map(afterKeys.map((key, index) => [key, index]))
  const sharedKeys = beforeKeys.filter((key) => afterIndexByKey.has(key))
  const sameMembers = beforeKeys.length === afterKeys.length && sharedKeys.length === beforeKeys.length
  const orderChanged = sameMembers && beforeKeys.some((key, index) => key !== afterKeys[index])

  if (orderChanged) {
    changes.push({
      path: pointer,
      operation: 'reordered',
      oldValue: beforeKeys,
      newValue: afterKeys,
    })
  }

  for (const key of beforeKeys) {
    if (afterIndexByKey.has(key)) continue
    const oldIndex = beforeIndexByKey.get(key)
    if (oldIndex === undefined) continue
    changes.push({
      path: appendJsonPointerSegment(pointer, String(oldIndex)),
      operation: 'removed',
      itemKey: key,
      oldIndex,
      oldValue: before[oldIndex],
    })
  }

  for (const key of afterKeys) {
    if (beforeIndexByKey.has(key)) continue
    const newIndex = afterIndexByKey.get(key)
    if (newIndex === undefined) continue
    changes.push({
      path: appendJsonPointerSegment(pointer, String(newIndex)),
      operation: 'added',
      itemKey: key,
      newIndex,
      newValue: after[newIndex],
    })
  }

  for (const key of sharedKeys) {
    const oldIndex = beforeIndexByKey.get(key)
    const newIndex = afterIndexByKey.get(key)
    if (oldIndex === undefined || newIndex === undefined) continue
    if (oldIndex !== newIndex) {
      changes.push({
        path: appendJsonPointerSegment(pointer, String(newIndex)),
        operation: 'moved',
        itemKey: key,
        oldIndex,
        newIndex,
      })
    }
    changes.push(...diffJsonValueAtPointer(
      before[oldIndex],
      after[newIndex],
      appendJsonPointerSegment(pointer, String(newIndex)),
    ))
  }

  return changes.sort(compareJsonChanges)
}

function stableArrayItemKey(value: unknown): string | undefined {
  if (isRecord(value)) {
    const id = value.id ?? value.ID ?? value.client_id ?? value.key ?? value.name
    if (typeof id === 'string' && id.trim()) return id.trim()
    if (typeof id === 'number' && Number.isFinite(id)) return String(id)
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return `${typeof value}:${String(value)}`
  }
  if (value === null) return 'null:null'
  return undefined
}

function compareJsonChanges(left: MovScriptJsonChange, right: MovScriptJsonChange): number {
  return left.path.localeCompare(right.path)
    || left.operation.localeCompare(right.operation)
    || String(left.itemKey ?? '').localeCompare(String(right.itemKey ?? ''))
}

function appendJsonPointerSegment(pointer: string, segment: string): string {
  return `${pointer}/${escapeJsonPointerSegment(segment)}`
}

function escapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1')
}

function unescapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~')
}

function jsonValueEquals(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
