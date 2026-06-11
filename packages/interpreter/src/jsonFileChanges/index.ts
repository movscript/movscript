import type {
  MovScriptFileChangeState,
} from '../fileChanges/index.js'
import {
  diffMovScriptJsonValues,
  jsonPointerToFieldPath,
  type MovScriptJsonChange,
} from '../jsonChanges/index.js'

export interface MovScriptJsonSourceFileSnapshot {
  path: string
  relativePath: string
  content: string
}

export interface MovScriptJsonFileInputChange {
  path: string
  state: MovScriptFileChangeState
}

export interface MovScriptJsonFieldChange {
  field: string
  operation: MovScriptFileChangeState
  oldValue?: unknown
  newValue?: unknown
  jsonPointer?: string
  jsonOperation?: MovScriptJsonChange['operation']
  oldIndex?: number
  newIndex?: number
}

export interface MovScriptJsonFileChange {
  path: string
  state: MovScriptFileChangeState
  oldValue?: unknown
  newValue?: unknown
  fieldChanges: MovScriptJsonFieldChange[]
}

export function jsonFileChangesFromFiles(
  changedFiles: readonly MovScriptJsonFileInputChange[],
  workingFiles: readonly MovScriptJsonSourceFileSnapshot[],
  baselineFiles: readonly MovScriptJsonSourceFileSnapshot[],
): MovScriptJsonFileChange[] {
  const workingByPath = new Map(workingFiles.map((file) => [file.path, file]))
  const baselineByRelativePath = new Map(baselineFiles.map((file) => [file.relativePath, file]))
  return changedFiles.flatMap((file) => {
    if (!file.path.endsWith('.json')) return []
    const workingFile = workingByPath.get(file.path)
    const baselineFile = baselineByRelativePath.get(file.path)
    const before = baselineFile ? parseJsonFile(baselineFile) : undefined
    const after = workingFile ? parseJsonFile(workingFile) : undefined
    return [{
      path: workingFile?.path ?? file.path,
      state: file.state,
      ...(before !== undefined ? { oldValue: before } : {}),
      ...(after !== undefined ? { newValue: after } : {}),
      fieldChanges: fieldChangesForJsonFileChange(file.state, before, after),
    }]
  })
}

export function fieldChangesForJsonFileChange(
  state: MovScriptFileChangeState,
  before: unknown,
  after: unknown,
): MovScriptJsonFieldChange[] {
  if (state === 'added') {
    return [{ field: '*', operation: 'added', newValue: after }]
  }
  if (state === 'deleted') {
    return [{ field: '*', operation: 'deleted', oldValue: before }]
  }
  return diffMovScriptJsonValues(before, after).map(jsonChangeToFieldChange)
}

function jsonChangeToFieldChange(change: MovScriptJsonChange): MovScriptJsonFieldChange {
  return {
    field: jsonPointerToFieldPath(change.path),
    operation: workspaceOperationForJsonChange(change),
    ...(change.oldValue !== undefined ? { oldValue: change.oldValue } : {}),
    ...(change.newValue !== undefined ? { newValue: change.newValue } : {}),
    jsonPointer: change.path || '/',
    jsonOperation: change.operation,
    ...(change.oldIndex !== undefined ? { oldIndex: change.oldIndex } : {}),
    ...(change.newIndex !== undefined ? { newIndex: change.newIndex } : {}),
  }
}

function workspaceOperationForJsonChange(change: MovScriptJsonChange): MovScriptFileChangeState {
  if (change.operation === 'added') return 'added'
  if (change.operation === 'removed') return 'deleted'
  return 'modified'
}

function parseJsonFile(file: MovScriptJsonSourceFileSnapshot): unknown {
  try {
    return JSON.parse(file.content) as unknown
  } catch {
    return undefined
  }
}
