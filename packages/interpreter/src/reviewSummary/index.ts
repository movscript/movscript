import type {
  MovScriptEntityChange,
  MovScriptSourceDomainGraph,
  MovScriptSourceDomainRecord,
} from '../entityChanges/index.js'
import type {
  MovScriptFileChange,
  MovScriptFileChangeState,
} from '../fileChanges/index.js'
import type {
  MovScriptBusinessSemanticKind,
  MovScriptSemanticChange,
  MovScriptSemanticChangeKind,
} from '../semanticChanges/index.js'
import type {
  MovScriptSourceValidationIssue,
} from '../sourceValidation/index.js'

export interface MovScriptBusinessChange extends MovScriptEntityChange {
  title?: string
  summary: string
  impactAreas: string[]
  sourcePaths: string[]
  semanticKinds: MovScriptSemanticChangeKind[]
  businessKinds: MovScriptBusinessSemanticKind[]
}

export interface MovScriptReviewSummary {
  total: number
  added: number
  modified: number
  deleted: number
  businessChanges: number
  errors: number
  warnings: number
}

export function businessChangesFromChangedEntities(
  changedEntities: readonly MovScriptEntityChange[],
  sourceGraph: MovScriptSourceDomainGraph,
  currentGraph: MovScriptSourceDomainGraph,
  semanticChanges: readonly MovScriptSemanticChange[] = [],
): MovScriptBusinessChange[] {
  const semanticByEntity = groupSemanticChangesByEntity(semanticChanges)
  return changedEntities.map((entity) => {
    const record = sourceRecordForChangedEntity(sourceGraph, entity)
      ?? sourceRecordForChangedEntity(currentGraph, entity)
    const title = isRecord(record?.data) ? stringField(record.data.title) : undefined
    const entitySemanticChanges = semanticByEntity.get(entitySemanticKey(entity.entityKind, entity.id)) ?? []
    const businessKinds = uniqueSorted(entitySemanticChanges.map((change) => change.businessKind))
    const semanticKinds = uniqueSorted(entitySemanticChanges.map((change) => change.kind))
    return {
      ...entity,
      ...(title !== undefined ? { title } : {}),
      summary: businessChangeSummary(entity, title, businessKinds),
      impactAreas: businessImpactAreasForEntityKind(entity.entityKind),
      sourcePaths: [entity.path],
      semanticKinds,
      businessKinds,
    }
  })
}

export function summarizeReview(
  changedFiles: readonly MovScriptFileChange[],
  businessChanges: readonly MovScriptBusinessChange[],
  issues: readonly MovScriptSourceValidationIssue[],
): MovScriptReviewSummary {
  return {
    total: changedFiles.length,
    added: changedFiles.filter((file) => file.state === 'added').length,
    modified: changedFiles.filter((file) => file.state === 'modified').length,
    deleted: changedFiles.filter((file) => file.state === 'deleted').length,
    businessChanges: businessChanges.length,
    errors: issues.filter((issue) => issue.severity === 'error').length,
    warnings: issues.filter((issue) => issue.severity === 'warning').length,
  }
}

function sourceRecordForChangedEntity(
  graph: MovScriptSourceDomainGraph,
  entity: MovScriptEntityChange,
): MovScriptSourceDomainRecord | undefined {
  return graph.records.find((record) => {
    return record.entityKind === entity.entityKind
      && (record.file.path === entity.path
        || record.file.relativePath === entity.path
        || (record.id !== undefined && entity.id !== undefined && String(record.id) === String(entity.id)))
  })
}

function businessChangeSummary(
  entity: MovScriptEntityChange,
  title: string | undefined,
  businessKinds: readonly MovScriptBusinessSemanticKind[] = [],
): string {
  const label = title ?? String(entity.id ?? entity.path)
  const state = businessStateVerb(entity.state)
  const primaryBusinessKind = businessKinds[0]
  if (entity.state === 'modified' && primaryBusinessKind) return `${businessKindLabel(primaryBusinessKind)}: ${label}`
  return `${businessEntityLabel(entity.entityKind)} ${state}: ${label}`
}

function businessStateVerb(state: MovScriptFileChangeState): string {
  switch (state) {
    case 'added':
      return 'added'
    case 'modified':
      return 'changed'
    case 'deleted':
      return 'deleted'
    case 'unchanged':
      return 'unchanged'
  }
}

function businessEntityLabel(entityKind: string): string {
  const labels: Record<string, string> = {
    project: 'Project',
    project_standards: 'Project standards',
    script: 'Script',
    script_version: 'Script version',
    script_block: 'Script block',
    production: 'Production',
    segment: 'Segment',
    scene_moment: 'Scene moment',
    shot: 'Shot',
    storyboard: 'Storyboard',
    audio_cue: 'Audio cue',
    expression_unit: 'Expression unit',
    content_unit: 'Content unit',
    keyframe: 'Keyframe',
    setting: 'Setting',
    setting_state: 'Setting state',
    asset: 'Asset',
  }
  return labels[entityKind] ?? entityKind
}

function businessImpactAreasForEntityKind(entityKind: string): string[] {
  switch (entityKind) {
    case 'project':
    case 'project_standards':
    case 'script':
    case 'script_version':
    case 'script_block':
      return ['workspace_context', 'generation_prompts']
    case 'setting':
    case 'setting_state':
    case 'asset':
      return ['asset_index', 'generation_context']
    case 'production':
    case 'segment':
    case 'scene_moment':
    case 'shot':
    case 'storyboard':
    case 'audio_cue':
    case 'expression_unit':
      return ['planning_tree', 'preview_timeline', 'generation_prompts']
    case 'content_unit':
    case 'keyframe':
      return ['content_production', 'generation_prompts', 'preview_timeline']
    default:
      return ['domain_index']
  }
}

function groupSemanticChangesByEntity(
  semanticChanges: readonly MovScriptSemanticChange[],
): Map<string, MovScriptSemanticChange[]> {
  const groups = new Map<string, MovScriptSemanticChange[]>()
  for (const change of semanticChanges) {
    const key = entitySemanticKey(change.entity.kind, change.entity.id)
    groups.set(key, [...(groups.get(key) ?? []), change])
  }
  return groups
}

function entitySemanticKey(entityKind: string, id: string | number | undefined): string {
  return `${entityKind}:${String(id ?? '')}`
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort()
}

function businessKindLabel(kind: MovScriptBusinessSemanticKind): string {
  const labels: Record<MovScriptBusinessSemanticKind, string> = {
    metadata_changed: 'Metadata changed',
    semantic_input_changed: 'Semantic input changed',
    reference_changed: 'Reference changed',
    selection_changed: 'Selection changed',
    sequence_reordered: 'Sequence reordered',
    shot_changed: 'Shot changed',
    storyboard_changed: 'Storyboard changed',
    keyframe_changed: 'Keyframe changed',
    content_unit_changed: 'Content unit changed',
    project_context_changed: 'Project context changed',
    production_structure_changed: 'Production structure changed',
    domain_entity_changed: 'Domain entity changed',
  }
  return labels[kind]
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
