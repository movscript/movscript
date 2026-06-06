import { deepEqual, isPlainObject } from './jsonDiff.js'
import { jsonPointer } from './paths.js'
import type { ProjectionMergeConflict, ProjectionMergeResult } from './types.js'

const missing = Symbol('missing')

export function mergeJson<T>(base: T, local: T, remote: T): ProjectionMergeResult<T> {
  const conflicts: ProjectionMergeConflict[] = []
  const value = mergeAt(base, local, remote, [], conflicts)
  if (conflicts.length > 0) {
    return { status: 'conflict', conflicts, partial: value as T }
  }
  return { status: 'merged', value: value as T, conflicts: [] }
}

function mergeAt(
  base: unknown,
  local: unknown,
  remote: unknown,
  path: Array<string | number>,
  conflicts: ProjectionMergeConflict[],
): unknown {
  if (deepEqual(local, remote)) return local
  if (deepEqual(local, base)) return remote
  if (deepEqual(remote, base)) return local

  if (isPlainObject(base) && isPlainObject(local) && isPlainObject(remote)) {
    const output: Record<string, unknown> = {}
    const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])

    for (const key of [...keys].sort()) {
      const merged = mergeAt(
        Object.hasOwn(base, key) ? base[key] : missing,
        Object.hasOwn(local, key) ? local[key] : missing,
        Object.hasOwn(remote, key) ? remote[key] : missing,
        [...path, key],
        conflicts,
      )
      if (merged !== missing) {
        output[key] = merged
      }
    }
    return output
  }

  conflicts.push({
    path: jsonPointer(path),
    base: base === missing ? undefined : base,
    local: local === missing ? undefined : local,
    remote: remote === missing ? undefined : remote,
    message: `Both local and remote changed ${jsonPointer(path) || '/'}`,
  })
  return local
}
