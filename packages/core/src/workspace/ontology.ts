export const MOVSCRIPT_EDIT_DIR = 'edit'
export const MOVSCRIPT_BUILD_DIR = '.build'
export const MOVSCRIPT_BUILD_CURRENT_DIR = '.build/current'
export const MOVSCRIPT_BUILD_INDEXES_DIR = '.build/indexes'
export const MOVSCRIPT_BUILD_REVIEWS_DIR = '.build/reviews'
export const MOVSCRIPT_BUILD_MANIFESTS_DIR = '.build/manifests'
export const MOVSCRIPT_DOMAIN_INDEX_PATH = '.build/indexes/domain-index.json'

export type MovScriptDomainWorkspaceKind =
  | 'project_standards_workspace'
  | 'setting_workspace'
  | 'production_workspace'
  | 'content_unit_workspace'
  | 'asset_workspace'

export type MovScriptWorkspaceFileRole = 'editable' | 'built' | 'runtime' | 'external'

export interface MovScriptWorkspaceFilePolicy {
  path: string
  role: MovScriptWorkspaceFileRole
}

export interface MovScriptDomainWorkspaceModel {
  kind: MovScriptDomainWorkspaceKind
  title: string
  entityTypes: string[]
  editablePathPatterns: string[]
  contextPathPatterns: string[]
  schemaIds: string[]
  instructions: string[]
}

export interface MovScriptWorkspaceGetModelInput {
  entityType: string
  entityId?: string | number
}

export interface MovScriptWorkspaceGetModelResult {
  workspaceKind: MovScriptDomainWorkspaceKind
  entityType: string
  entityId?: string | number
  editablePaths: string[]
  contextPaths: string[]
  schemaIds: string[]
  instructions: string[]
}

export const MOVSCRIPT_DOMAIN_WORKSPACE_MODELS: Record<MovScriptDomainWorkspaceKind, MovScriptDomainWorkspaceModel> = {
  project_standards_workspace: {
    kind: 'project_standards_workspace',
    title: 'Project standards workspace',
    entityTypes: ['project_standards', 'prompt_rule', 'style_rule', 'quality_rule'],
    editablePathPatterns: ['edit/standards/project_standards.json'],
    contextPathPatterns: [],
    schemaIds: ['movscript.project_standards.v1'],
    instructions: [
      'Edit project-wide creative standards under edit/standards.',
      'Run review after edits; build must succeed before the changes are current.',
    ],
  },
  setting_workspace: {
    kind: 'setting_workspace',
    title: 'Setting workspace',
    entityTypes: ['setting', 'setting_state', 'setting_relationship'],
    editablePathPatterns: [
      'edit/setting/setting_{id}.json',
      'edit/setting/setting_{id}.states/state_{id}.json',
      'edit/setting/relationships/relationship_{id}.json',
    ],
    contextPathPatterns: ['edit/standards/project_standards.json'],
    schemaIds: ['movscript.setting.v1', 'movscript.setting_state.v1', 'movscript.setting_relationship.v1'],
    instructions: [
      'Use setting for characters, locations, props, world rules, and style references.',
      'Create and update setting records only under edit/setting.',
      'Run review after edits; build must succeed before the changes are current.',
    ],
  },
  production_workspace: {
    kind: 'production_workspace',
    title: 'Production workspace',
    entityTypes: ['production', 'segment', 'scene_moment', 'writing_expression', 'setting_usage'],
    editablePathPatterns: [
      'edit/productions/production_{id}/production.json',
      'edit/productions/production_{productionId}/segments/segment_{id}.json',
      'edit/productions/production_{productionId}/scene_moments/scene_moment_{id}.json',
    ],
    contextPathPatterns: ['edit/setting/**', 'edit/standards/project_standards.json'],
    schemaIds: [
      'movscript.production.v1',
      'movscript.segment.v1',
      'movscript.scene_moment.v1',
      'movscript.writing_expression.v1',
      'movscript.setting_usage.v1',
    ],
    instructions: [
      'Edit production structure under edit/productions.',
      'Reference setting ids through setting_usage instead of embedding setting data.',
      'Run review after edits; build must succeed before the changes are current.',
    ],
  },
  content_unit_workspace: {
    kind: 'content_unit_workspace',
    title: 'Content unit workspace',
    entityTypes: ['content_unit', 'content_unit_timing', 'content_unit_visual_plan', 'storyboard_brief'],
    editablePathPatterns: ['edit/productions/production_{productionId}/content_units/content_unit_{id}.json'],
    contextPathPatterns: ['edit/setting/**', 'edit/standards/project_standards.json', 'edit/productions/**'],
    schemaIds: ['movscript.content_unit.v1'],
    instructions: [
      'Edit production content units under edit/productions.',
      'Use content units for production-ready shot, audio, subtitle, caption, transition, and timing intent.',
      'Run review after edits; build must succeed before the changes are current.',
    ],
  },
  asset_workspace: {
    kind: 'asset_workspace',
    title: 'Asset workspace',
    entityTypes: ['asset_slot', 'candidate', 'candidate_decision', 'keyframe'],
    editablePathPatterns: [
      'edit/assets/asset_slot_{id}.json',
      'edit/assets/asset_slot_{assetSlotId}.candidates/candidate_{id}.json',
      'edit/productions/production_{productionId}/keyframes/keyframe_{id}.json',
      'edit/productions/production_{productionId}/keyframes/keyframe_{keyframeId}.candidates/candidate_{id}.json',
    ],
    contextPathPatterns: ['edit/setting/**', 'edit/standards/project_standards.json', 'edit/productions/**'],
    schemaIds: [
      'movscript.asset_slot.v1',
      'movscript.candidate.v1',
      'movscript.candidate_decision.v1',
      'movscript.keyframe.v1',
    ],
    instructions: [
      'Edit asset requirements and candidate records under edit/assets or edit/productions keyframe folders.',
      'Reference setting ids and resource ids; do not embed resource binaries or generation job runtime state.',
      'Run review after edits; build must succeed before the changes are current.',
    ],
  },
}

const ENTITY_WORKSPACE_KIND: Record<string, MovScriptDomainWorkspaceKind> = Object.values(MOVSCRIPT_DOMAIN_WORKSPACE_MODELS)
  .reduce<Record<string, MovScriptDomainWorkspaceKind>>((out, model) => {
    for (const entityType of model.entityTypes) out[entityType] = model.kind
    return out
  }, {})

export function getMovScriptDomainWorkspaceModel(kind: MovScriptDomainWorkspaceKind): MovScriptDomainWorkspaceModel {
  return MOVSCRIPT_DOMAIN_WORKSPACE_MODELS[kind]
}

export function listMovScriptDomainWorkspaceModels(): MovScriptDomainWorkspaceModel[] {
  return Object.values(MOVSCRIPT_DOMAIN_WORKSPACE_MODELS)
}

export function resolveMovScriptDomainWorkspaceKindForEntity(entityType: string): MovScriptDomainWorkspaceKind | undefined {
  return ENTITY_WORKSPACE_KIND[normalizeEntityType(entityType)]
}

export function getMovScriptWorkspaceModel(input: MovScriptWorkspaceGetModelInput): MovScriptWorkspaceGetModelResult {
  const entityType = normalizeEntityType(input.entityType)
  const workspaceKind = resolveMovScriptDomainWorkspaceKindForEntity(entityType)
  if (!workspaceKind) throw new Error(`Unsupported MovScript workspace entity type: ${input.entityType}`)
  const model = getMovScriptDomainWorkspaceModel(workspaceKind)
  return {
    workspaceKind,
    entityType,
    ...(input.entityId !== undefined ? { entityId: input.entityId } : {}),
    editablePaths: materializePathPatterns(model.editablePathPatterns, input),
    contextPaths: model.contextPathPatterns,
    schemaIds: model.schemaIds,
    instructions: model.instructions,
  }
}

export function classifyMovScriptWorkspacePath(path: string): MovScriptWorkspaceFilePolicy {
  const normalized = normalizeWorkspacePath(path)
  if (normalized.startsWith(`${MOVSCRIPT_EDIT_DIR}/`)) return { path: normalized, role: 'editable' }
  if (normalized.startsWith(`${MOVSCRIPT_BUILD_DIR}/`)) return { path: normalized, role: 'built' }
  if (normalized.startsWith('.movscript/') || normalized.startsWith('runtime/') || normalized.startsWith('tmp/')) {
    return { path: normalized, role: 'runtime' }
  }
  return { path: normalized, role: 'external' }
}

export function normalizeWorkspacePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
}

function materializePathPatterns(patterns: string[], input: MovScriptWorkspaceGetModelInput): string[] {
  const id = input.entityId === undefined ? '{id}' : safePathToken(input.entityId)
  return patterns.map((pattern) => pattern
    .replaceAll('{id}', id)
    .replaceAll('{productionId}', '{productionId}')
    .replaceAll('{assetSlotId}', '{assetSlotId}')
    .replaceAll('{keyframeId}', '{keyframeId}'))
}

function normalizeEntityType(entityType: string): string {
  return entityType.trim().replace(/^movscript\./, '').replace(/\.v\d+$/, '')
}

function safePathToken(value: string | number): string {
  return String(value).trim().replace(/[^a-zA-Z0-9_-]+/g, '_')
}
