import {
  jsonFileChangesFromFiles,
  type MovScriptJsonFieldChange,
} from '../jsonFileChanges/index.js'
import type {
  MovScriptFileChangeState,
} from '../fileChanges/index.js'
import {
  entityRefAliases,
  normalizeWorkspacePath,
} from '@movscript/workspace/layout'

export interface MovScriptSourceFileSnapshot {
  path: string
  relativePath: string
  content: string
}

export interface MovScriptSourceDomainRecord {
  file: MovScriptSourceFileSnapshot
  data: unknown
  entityKind?: string
  id?: string | number
  dir: string
}

export interface MovScriptSourceDomainGraph {
  records: MovScriptSourceDomainRecord[]
  entityPaths: Set<string>
  byId: Map<string, MovScriptSourceDomainRecord>
}

export interface MovScriptEntityFieldChange extends MovScriptJsonFieldChange {}

export interface MovScriptEntityFileChange {
  path: string
  state: MovScriptFileChangeState
}

export interface MovScriptEntityChange {
  entityKind: string
  path: string
  id?: string | number
  clientId?: string
  state: MovScriptFileChangeState
  fieldChanges?: MovScriptEntityFieldChange[]
}

export function buildSourceDomainGraph(
  files: readonly MovScriptSourceFileSnapshot[],
): MovScriptSourceDomainGraph {
  const records = files.map((file): MovScriptSourceDomainRecord => {
    const data = parseWorkspaceDocument(file.path, file.content)
    const entityKind = sourceEntityKindFromRelativePath(file.relativePath)
    const id = isRecord(data) && entityKind ? sourceEntityStableId(data, entityKind) : undefined
    return {
      file,
      data,
      entityKind,
      ...(id !== undefined ? { id } : {}),
      dir: file.relativePath.replace(/\/[^/]+$/, ''),
    }
  })
  const byId = new Map<string, MovScriptSourceDomainRecord>()
  for (const record of records) {
    if (!record.entityKind) continue
    if (record.id !== undefined) {
      for (const alias of entityRefAliases(record.id, record.entityKind)) {
        byId.set(entityKey(record.entityKind, alias), record)
      }
    }
    const directoryId = stableDirectoryIdForSourceEntity(record.file.relativePath, record.entityKind)
    if (directoryId !== undefined) {
      for (const alias of entityRefAliases(directoryId, record.entityKind)) {
        byId.set(entityKey(record.entityKind, alias), record)
      }
    }
  }
  return {
    records,
    entityPaths: new Set(records.map((record) => record.dir)),
    byId,
  }
}

export function changedEntitiesFromFiles(
  changedFiles: readonly MovScriptEntityFileChange[],
  sourceGraph: MovScriptSourceDomainGraph,
  currentGraph: MovScriptSourceDomainGraph,
): MovScriptEntityChange[] {
  const sourceByPath = new Map(sourceGraph.records.map((record) => [record.file.path, record]))
  const currentByRelativePath = new Map(currentGraph.records.map((record) => [record.file.relativePath, record]))
  const jsonFileChangesByPath = new Map(jsonFileChangesFromFiles(
    changedFiles,
    sourceGraph.records.map((record) => record.file),
    currentGraph.records.map((record) => record.file),
  ).map((change) => [change.path, change]))
  return changedFiles.flatMap((file) => {
    if (!file.path.endsWith('.json')) return []
    const sourceRecord = sourceByPath.get(file.path)
    const currentRecord = currentByRelativePath.get(file.path)
    const record = sourceRecord ?? currentRecord
    const entity = isRecord(record?.data) ? record.data : {}
    const entityKind = record?.entityKind ?? entityKindFromFilePath(file.path, entity)
    const id = sourceEntityStableId(entity, entityKind)
    return [{
      entityKind,
      path: sourceRecord?.file.path ?? file.path,
      ...(id !== undefined ? { id } : {}),
      ...(typeof entity.client_id === 'string' ? { clientId: entity.client_id } : {}),
      state: file.state,
      fieldChanges: jsonFileChangesByPath.get(sourceRecord?.file.path ?? file.path)?.fieldChanges ?? [],
    }]
  })
}

export function sourceRecordByPathOrId(
  graph: MovScriptSourceDomainGraph,
  entityKind: string,
  ref: string | number,
): MovScriptSourceDomainRecord | undefined {
  const normalizedRef = typeof ref === 'string' ? normalizeWorkspacePath(ref) : String(ref)
  return graph.records.find((record) => {
    return record.entityKind === entityKind
      && (record.dir === normalizedRef || record.file.relativePath === normalizedRef || String(record.id) === String(ref))
  }) ?? entityRefAliases(ref, entityKind)
    .map((alias) => graph.byId.get(entityKey(entityKind, alias)))
    .find((record): record is MovScriptSourceDomainRecord => record !== undefined)
}

export function sourceEntityKindFromRelativePath(path: string): string | undefined {
  const normalized = normalizeWorkspacePath(path)
  const fileName = normalized.split('/').pop()
  if (fileName === 'project.json') return 'project'
  if (fileName === 'project_standards.json') return 'project_standards'
  if (fileName === 'setting.json') return 'setting'
  if (fileName === 'setting_state.json') return 'setting_state'
  if (fileName === 'asset.json') return 'asset'
  if (fileName === 'script.json') return 'script'
  if (fileName === 'script_version.json') return 'script_version'
  if (fileName === 'script_block.json') return 'script_block'
  if (fileName === 'content_unit.json') return 'content_unit'
  if (fileName === 'keyframe.json') return 'keyframe'
  if (fileName === 'production.json') return 'production'
  if (fileName === 'segment.json') return 'segment'
  if (fileName === 'scene_moment.json') return 'scene_moment'
  if (fileName === 'storyboard.json') return 'storyboard'
  if (fileName === 'audio_cue.json') return 'audio_cue'
  if (fileName === 'expression_unit.json') return 'expression_unit'
  return undefined
}

export function stableDirectoryIdForSourceEntity(path: string, entityKind: string): string | undefined {
  const parts = normalizeWorkspacePath(path).split('/')
  if (entityKind === 'project' || entityKind === 'project_standards') return undefined
  if (entityKind === 'setting') return parts[1]
  if (entityKind === 'setting_state') return parts[3]
  if (entityKind === 'asset') return parts[5]
  if (entityKind === 'script') return parts[1]
  if (entityKind === 'script_version') return parts[3]
  if (entityKind === 'script_block') return parts[5]
  if (entityKind === 'content_unit') return parts[1]
  if (entityKind === 'keyframe') return pathSegmentAfter(parts, 'keyframes')
  if (entityKind === 'production') return parts[1]
  if (entityKind === 'segment') return parts[3]
  if (entityKind === 'scene_moment') return parts[5]
  if (entityKind === 'storyboard') return pathSegmentAfter(parts, 'storyboards')
  if (entityKind === 'audio_cue') return parts[7]
  if (entityKind === 'expression_unit') return parts[7]
  return undefined
}

function pathSegmentAfter(parts: string[], segment: string): string | undefined {
  const index = parts.indexOf(segment)
  return index >= 0 ? parts[index + 1] : undefined
}

export function sourceEntityStableId(record: Record<string, unknown>, entityKind: string): string | number | undefined {
  if (entityKind === 'project') return idField(record.project_id ?? record.ID ?? record.id)
  return idField(record.id ?? record.ID)
}

function parseWorkspaceDocument(path: string, content: string): unknown {
  if (!path.endsWith('.json')) return content
  try {
    return JSON.parse(content) as unknown
  } catch {
    return undefined
  }
}

function entityKindFromFilePath(path: string, record: Record<string, unknown>): string {
  const schema = typeof record.schema === 'string' ? record.schema : undefined
  if (schema) {
    const schemaKind = schema.replace(/^movscript\./, '').replace(/\.v\d+$/, '')
    if (schemaKind === 'shot') return 'unknown'
    if (schemaKind !== 'shot') return schemaKind
  }
  const fileName = path.split('/').pop() ?? path
  const prefix = /^([a-z_]+)_/.exec(fileName)?.[1]
  return prefix ?? fileName.replace(/\.[^.]+$/, '')
}

function entityKey(entityKind: string, id: unknown): string {
  return `${entityKind}:${String(id ?? '')}`
}

function idField(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
