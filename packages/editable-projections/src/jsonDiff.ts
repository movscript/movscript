import type { JsonPatchOperation, JsonValue } from './types.js'
import { jsonPointer } from './paths.js'

const missing = Symbol('missing')

export function diffJson(base: unknown, target: unknown): JsonPatchOperation[] {
  const operations: JsonPatchOperation[] = []
  diffAt(base, target, [], operations)
  return operations
}

export interface DiffJsonByIdOptions {
  idKeys?: string[]
}

export function diffJsonById(base: unknown, target: unknown, options: DiffJsonByIdOptions = {}): JsonPatchOperation[] {
  const operations: JsonPatchOperation[] = []
  diffByIdAt(base, target, [], operations, options.idKeys ?? ['id', 'client_id', 'key'])
  return operations
}

function diffAt(base: unknown, target: unknown, path: Array<string | number>, operations: JsonPatchOperation[]): void {
  if (deepEqual(base, target)) return

  if (base === missing) {
    operations.push({ op: 'add', path: jsonPointer(path), value: target as JsonValue })
    return
  }
  if (target === missing) {
    operations.push({ op: 'remove', path: jsonPointer(path) })
    return
  }

  if (isPlainObject(base) && isPlainObject(target)) {
    const keys = new Set([...Object.keys(base), ...Object.keys(target)])
    for (const key of [...keys].sort()) {
      diffAt(
        Object.hasOwn(base, key) ? base[key] : missing,
        Object.hasOwn(target, key) ? target[key] : missing,
        [...path, key],
        operations,
      )
    }
    return
  }

  operations.push({ op: 'replace', path: jsonPointer(path), value: target as JsonValue })
}

function diffByIdAt(
  base: unknown,
  target: unknown,
  path: Array<string | number>,
  operations: JsonPatchOperation[],
  idKeys: string[],
): void {
  if (deepEqual(base, target)) return

  if (base === missing) {
    operations.push({ op: 'add', path: jsonPointer(path), value: target as JsonValue })
    return
  }
  if (target === missing) {
    operations.push({ op: 'remove', path: jsonPointer(path) })
    return
  }

  if (isPlainObject(base) && isPlainObject(target)) {
    const keys = new Set([...Object.keys(base), ...Object.keys(target)])
    for (const key of [...keys].sort()) {
      diffByIdAt(
        Object.hasOwn(base, key) ? base[key] : missing,
        Object.hasOwn(target, key) ? target[key] : missing,
        [...path, key],
        operations,
        idKeys,
      )
    }
    return
  }

  if (Array.isArray(base) && Array.isArray(target) && canDiffArrayById(base, target, idKeys)) {
    diffArrayById(base, target, path, operations, idKeys)
    return
  }

  operations.push({ op: 'replace', path: jsonPointer(path), value: target as JsonValue })
}

function diffArrayById(
  base: unknown[],
  target: unknown[],
  path: Array<string | number>,
  operations: JsonPatchOperation[],
  idKeys: string[],
): void {
  const baseItems = indexArrayItems(base, idKeys)
  const targetItems = indexArrayItems(target, idKeys)

  for (const item of [...baseItems].sort((left, right) => right.index - left.index)) {
    if (!targetItems.some((targetItem) => targetItem.id === item.id)) {
      operations.push({ op: 'remove', path: jsonPointer([...path, item.index]) })
    }
  }

  for (const item of targetItems) {
    const baseItem = baseItems.find((candidate) => candidate.id === item.id)
    if (!baseItem) {
      operations.push({ op: 'add', path: jsonPointer([...path, item.index]), value: item.value as JsonValue })
      continue
    }
    diffByIdAt(baseItem.value, item.value, [...path, item.index], operations, idKeys)
  }
}

function canDiffArrayById(base: unknown[], target: unknown[], idKeys: string[]): boolean {
  if (base.length === 0 && target.length === 0) return false
  const baseIds = base.map((item) => arrayItemId(item, idKeys))
  const targetIds = target.map((item) => arrayItemId(item, idKeys))
  if (baseIds.some((id) => id === undefined) || targetIds.some((id) => id === undefined)) return false
  if (new Set(baseIds).size !== baseIds.length || new Set(targetIds).size !== targetIds.length) return false

  const targetIdSet = new Set(targetIds)
  const commonBaseIds = baseIds.filter((id): id is string => id !== undefined && targetIdSet.has(id))
  const commonBaseIdSet = new Set(commonBaseIds)
  const commonTargetIds = targetIds.filter((id): id is string => id !== undefined && commonBaseIdSet.has(id))

  return commonBaseIds.length === commonTargetIds.length
    && commonBaseIds.every((id, index) => id === commonTargetIds[index])
}

function arrayItemId(item: unknown, idKeys: string[]): string | undefined {
  if (!isPlainObject(item)) return undefined
  for (const key of idKeys) {
    const value = item[key]
    if (typeof value === 'string' || typeof value === 'number') {
      return `${key}:${String(value)}`
    }
  }
  return undefined
}

function indexArrayItems(items: unknown[], idKeys: string[]): Array<{ id: string; index: number; value: unknown }> {
  return items.map((value, index) => {
    const id = arrayItemId(value, idKeys)
    if (id === undefined) {
      throw new Error('Cannot index array item without a stable id.')
    }
    return { id, index, value }
  })
}

export function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => deepEqual(value, right[index]))
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left).sort()
    const rightKeys = Object.keys(right).sort()
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key, index) => key === rightKeys[index] && deepEqual(left[key], right[key]))
  }
  return false
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
}
