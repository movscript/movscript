import { safeWorkspacePathToken } from '../layout/index.js'
import type { SemanticEntityKind, WorkspaceKind } from './schemaTypes.js'

export type MovScriptDomainWorkspaceKind = WorkspaceKind

export interface WorkspaceModel<K extends WorkspaceKind = WorkspaceKind> {
  kind: K
  children: WorkspaceModel[]
}

export type WorkspaceEntityKindMap = {
  project_workspace: 'project'
  project_standards_workspace: 'project_standards'
  setting_workspace: 'setting'
  setting_state_workspace: 'setting_state'
  asset_workspace: 'asset'
  script_workspace: 'script'
  script_version_workspace: 'script_version'
  script_block_workspace: 'script_block'
  production_workspace: 'production'
  segment_workspace: 'segment'
  scene_moment_workspace: 'scene_moment'
  storyboard_workspace: 'storyboard'
  writing_expression_workspace: 'writing_expression'
  content_unit_workspace: 'content_unit'
  keyframe_workspace: 'keyframe'
}

export const WORKSPACE_ENTITY_KIND: WorkspaceEntityKindMap = {
  project_workspace: 'project',
  project_standards_workspace: 'project_standards',
  setting_workspace: 'setting',
  setting_state_workspace: 'setting_state',
  asset_workspace: 'asset',
  script_workspace: 'script',
  script_version_workspace: 'script_version',
  script_block_workspace: 'script_block',
  production_workspace: 'production',
  segment_workspace: 'segment',
  scene_moment_workspace: 'scene_moment',
  storyboard_workspace: 'storyboard',
  writing_expression_workspace: 'writing_expression',
  content_unit_workspace: 'content_unit',
  keyframe_workspace: 'keyframe',
}

export const WORKSPACE_CONTENT_SCHEMA_IDS = {
  projectStandardsWorkspace: 'movscript.project_standards_workspace.v1',
  settingWorkspace: 'movscript.setting_workspace.v1',
  assetWorkspace: 'movscript.asset_workspace.v1',
  productionWorkspace: 'movscript.production_workspace.v1',
  contentUnitWorkspace: 'movscript.content_unit_workspace.v1',
} as const

export const WORKSPACE_SCOPES = {
  projectStandardsWorkspace: 'project_standards_workspace',
  settingWorkspace: 'setting_workspace',
  assetWorkspace: 'asset_workspace',
  productionWorkspace: 'production_workspace',
  contentUnitWorkspace: 'content_unit_workspace',
} as const

export const MOVSCRIPT_PROJECT_WORKSPACE_MODEL: WorkspaceModel<'project_workspace'> = {
  kind: 'project_workspace',
  children: [
    { kind: 'project_standards_workspace', children: [] },
    {
      kind: 'setting_workspace',
      children: [
        {
          kind: 'setting_state_workspace',
          children: [{ kind: 'asset_workspace', children: [] }],
        },
        { kind: 'asset_workspace', children: [] },
      ],
    },
    {
      kind: 'script_workspace',
      children: [
        {
          kind: 'script_version_workspace',
          children: [{ kind: 'script_block_workspace', children: [] }],
        },
      ],
    },
    {
      kind: 'content_unit_workspace',
      children: [{ kind: 'keyframe_workspace', children: [] }],
    },
    {
      kind: 'production_workspace',
      children: [
        {
          kind: 'segment_workspace',
          children: [
            {
              kind: 'scene_moment_workspace',
              children: [
                { kind: 'keyframe_workspace', children: [] },
                {
                  kind: 'storyboard_workspace',
                  children: [{ kind: 'writing_expression_workspace', children: [] }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}

export interface MovScriptDomainWorkspaceModel {
  kind: MovScriptDomainWorkspaceKind
  title: string
  entityKinds: SemanticEntityKind[]
  editablePathPatterns: string[]
  contextPathPatterns: string[]
  schemaIds: string[]
  instructions: string[]
}

export interface MovScriptWorkspaceGetModelInput {
  entityKind: string
  entityId?: string | number
}

export interface MovScriptWorkspaceGetModelResult {
  workspaceKind: MovScriptDomainWorkspaceKind
  entityKind: SemanticEntityKind
  entityId?: string | number
  editablePaths: string[]
  contextPaths: string[]
  schemaIds: string[]
  instructions: string[]
}

export const MOVSCRIPT_DOMAIN_WORKSPACE_MODELS: Record<MovScriptDomainWorkspaceKind, MovScriptDomainWorkspaceModel> = {
  project_workspace: {
    kind: 'project_workspace',
    title: 'Project workspace',
    entityKinds: ['project'],
    editablePathPatterns: ['project.json'],
    contextPathPatterns: [],
    schemaIds: ['movscript.project.v1'],
    instructions: ['Edit the project root entity in project.json. Build validates the source tree and writes .build artifacts.'],
  },
  project_standards_workspace: {
    kind: 'project_standards_workspace',
    title: 'Project standards workspace',
    entityKinds: ['project_standards'],
    editablePathPatterns: ['project_standards.json'],
    contextPathPatterns: ['project.json'],
    schemaIds: ['movscript.project_standards.v1'],
    instructions: ['Edit project-wide creative standards in project_standards.json. Build uses these standards when compiling generation context.'],
  },
  setting_workspace: {
    kind: 'setting_workspace',
    title: 'Setting workspace',
    entityKinds: ['setting'],
    editablePathPatterns: ['settings/setting_{id}/setting.json'],
    contextPathPatterns: ['project.json', 'project_standards.json'],
    schemaIds: ['movscript.setting.v1'],
    instructions: ['Use setting workspaces for characters, locations, props, world rules, and style facts. Assets belong under a setting or setting state.'],
  },
  setting_state_workspace: {
    kind: 'setting_state_workspace',
    title: 'Setting state workspace',
    entityKinds: ['setting_state'],
    editablePathPatterns: ['settings/{settingId}/states/setting_state_{id}/setting_state.json'],
    contextPathPatterns: ['settings/{settingId}/setting.json', 'project_standards.json'],
    schemaIds: ['movscript.setting_state.v1'],
    instructions: ['Use setting state workspaces for conditional state such as wet hair, damaged prop, or rainy location variants.'],
  },
  asset_workspace: {
    kind: 'asset_workspace',
    title: 'Asset workspace',
    entityKinds: ['asset'],
    editablePathPatterns: [
      'settings/{settingId}/assets/asset_{id}/asset.json',
      'settings/{settingId}/states/{settingStateId}/assets/asset_{id}/asset.json',
    ],
    contextPathPatterns: ['settings/{settingId}/setting.json', 'project_standards.json'],
    schemaIds: ['movscript.asset.v1'],
    instructions: ['Assets are setting-owned resource slots. Keep candidates and lock data inside asset.json.'],
  },
  script_workspace: {
    kind: 'script_workspace',
    title: 'Script workspace',
    entityKinds: ['script'],
    editablePathPatterns: ['scripts/script_{id}/script.json', 'scripts/script_{id}/script.md'],
    contextPathPatterns: ['project.json'],
    schemaIds: ['movscript.script.v1'],
    instructions: ['Use script workspaces for screenplay roots and source text references.'],
  },
  script_version_workspace: {
    kind: 'script_version_workspace',
    title: 'Script version workspace',
    entityKinds: ['script_version'],
    editablePathPatterns: ['scripts/{scriptId}/versions/script_version_{id}/script_version.json'],
    contextPathPatterns: ['scripts/{scriptId}/script.json'],
    schemaIds: ['movscript.script_version.v1'],
    instructions: ['Use script version workspaces for versioned script snapshots and block grouping.'],
  },
  script_block_workspace: {
    kind: 'script_block_workspace',
    title: 'Script block workspace',
    entityKinds: ['script_block'],
    editablePathPatterns: ['scripts/{scriptId}/versions/{scriptVersionId}/blocks/script_block_{id}/script_block.json'],
    contextPathPatterns: ['scripts/{scriptId}/versions/{scriptVersionId}/script_version.json'],
    schemaIds: ['movscript.script_block.v1'],
    instructions: ['Use script block workspaces for addressable text blocks referenced by planning entities.'],
  },
  production_workspace: {
    kind: 'production_workspace',
    title: 'Production workspace',
    entityKinds: ['production'],
    editablePathPatterns: ['productions/production_{id}/production.json'],
    contextPathPatterns: ['project.json', 'project_standards.json', 'settings/**', 'scripts/**'],
    schemaIds: ['movscript.production.v1'],
    instructions: ['Edit production roots under productions/. Segment and scene moment children hold the planning structure.'],
  },
  segment_workspace: {
    kind: 'segment_workspace',
    title: 'Segment workspace',
    entityKinds: ['segment'],
    editablePathPatterns: ['productions/{productionId}/segments/segment_{id}/segment.json'],
    contextPathPatterns: ['productions/{productionId}/production.json'],
    schemaIds: ['movscript.segment.v1'],
    instructions: ['Use segment workspaces for rhythm sections inside a production. Order lives in segment.json, not the directory name.'],
  },
  scene_moment_workspace: {
    kind: 'scene_moment_workspace',
    title: 'Scene moment workspace',
    entityKinds: ['scene_moment'],
    editablePathPatterns: ['productions/{productionId}/segments/{segmentId}/scene_moments/scene_moment_{id}/scene_moment.json'],
    contextPathPatterns: ['productions/{productionId}/segments/{segmentId}/segment.json', 'settings/**'],
    schemaIds: ['movscript.scene_moment.v1'],
    instructions: ['Scene moments describe the planning context and storyboard timing. They do not own content units.'],
  },
  storyboard_workspace: {
    kind: 'storyboard_workspace',
    title: 'Storyboard workspace',
    entityKinds: ['storyboard'],
    editablePathPatterns: ['productions/{productionId}/segments/{segmentId}/scene_moments/{sceneMomentId}/storyboards/storyboard_{id}/storyboard.json'],
    contextPathPatterns: ['settings/**', 'project_standards.json'],
    schemaIds: ['movscript.storyboard.v1'],
    instructions: ['Storyboards hold director planning: setting refs, shot plans, coverage, continuity, and panels. They do not reference content units.'],
  },
  writing_expression_workspace: {
    kind: 'writing_expression_workspace',
    title: 'Writing expression workspace',
    entityKinds: ['writing_expression'],
    editablePathPatterns: ['productions/{productionId}/segments/{segmentId}/scene_moments/{sceneMomentId}/storyboards/{storyboardId}/writing_expressions/writing_expression_{id}/writing_expression.json'],
    contextPathPatterns: ['productions/{productionId}/segments/{segmentId}/scene_moments/{sceneMomentId}/storyboards/{storyboardId}/storyboard.json'],
    schemaIds: ['movscript.writing_expression.v1'],
    instructions: ['Writing expressions are storyboard-level dialogue, narration, subtitle, caption, or textual expression options.'],
  },
  content_unit_workspace: {
    kind: 'content_unit_workspace',
    title: 'Content unit workspace',
    entityKinds: ['content_unit'],
    editablePathPatterns: ['content_units/content_unit_{id}/content_unit.json'],
    contextPathPatterns: ['project_standards.json', 'settings/**', 'productions/**'],
    schemaIds: ['movscript.content_unit.v1'],
    instructions: ['Content units are project-level stable production units. They reference scene moments and storyboards through source_context.'],
  },
  keyframe_workspace: {
    kind: 'keyframe_workspace',
    title: 'Keyframe workspace',
    entityKinds: ['keyframe'],
    editablePathPatterns: [
      'content_units/{contentUnitId}/keyframes/keyframe_{id}/keyframe.json',
      'productions/{productionId}/segments/{segmentId}/scene_moments/{sceneMomentId}/keyframes/keyframe_{id}/keyframe.json',
    ],
    contextPathPatterns: ['settings/**', 'project_standards.json'],
    schemaIds: ['movscript.keyframe.v1'],
    instructions: ['Keyframes are visual anchors. Scene-level and content-unit-level keyframes use the same schema.'],
  },
}

const ENTITY_WORKSPACE_KIND = Object.entries(WORKSPACE_ENTITY_KIND)
  .reduce<Record<SemanticEntityKind, MovScriptDomainWorkspaceKind>>((out, [workspaceKind, entityKind]) => {
    out[entityKind] = workspaceKind as MovScriptDomainWorkspaceKind
    return out
  }, {} as Record<SemanticEntityKind, MovScriptDomainWorkspaceKind>)

export function entityKindForWorkspaceKind<K extends WorkspaceKind>(kind: K): WorkspaceEntityKindMap[K] {
  return WORKSPACE_ENTITY_KIND[kind]
}

export function getMovScriptDomainWorkspaceModel(kind: MovScriptDomainWorkspaceKind): MovScriptDomainWorkspaceModel {
  return MOVSCRIPT_DOMAIN_WORKSPACE_MODELS[kind]
}

export function listMovScriptDomainWorkspaceModels(): MovScriptDomainWorkspaceModel[] {
  return Object.values(MOVSCRIPT_DOMAIN_WORKSPACE_MODELS)
}

export function resolveMovScriptDomainWorkspaceKindForEntity(entityKind: string): MovScriptDomainWorkspaceKind | undefined {
  const normalized = normalizeEntityKind(entityKind)
  return isSemanticEntityKind(normalized) ? ENTITY_WORKSPACE_KIND[normalized] : undefined
}

export function getMovScriptWorkspaceModel(input: MovScriptWorkspaceGetModelInput): MovScriptWorkspaceGetModelResult {
  const entityKind = normalizeEntityKind(input.entityKind)
  if (!isSemanticEntityKind(entityKind)) throw new Error(`Unsupported MovScript workspace entity kind: ${input.entityKind}`)
  const workspaceKind = resolveMovScriptDomainWorkspaceKindForEntity(entityKind)
  if (!workspaceKind) throw new Error(`Unsupported MovScript workspace entity kind: ${input.entityKind}`)
  const model = getMovScriptDomainWorkspaceModel(workspaceKind)
  return {
    workspaceKind,
    entityKind,
    ...(input.entityId !== undefined ? { entityId: input.entityId } : {}),
    editablePaths: expandPathPatterns(model.editablePathPatterns, input),
    contextPaths: model.contextPathPatterns,
    schemaIds: model.schemaIds,
    instructions: model.instructions,
  }
}

function expandPathPatterns(patterns: string[], input: MovScriptWorkspaceGetModelInput): string[] {
  const id = input.entityId === undefined ? '{id}' : safeWorkspacePathToken(input.entityId)
  return patterns.map((pattern) => pattern
    .replaceAll('{id}', id)
    .replaceAll('{settingId}', '{settingId}')
    .replaceAll('{settingStateId}', '{settingStateId}')
    .replaceAll('{scriptId}', '{scriptId}')
    .replaceAll('{scriptVersionId}', '{scriptVersionId}')
    .replaceAll('{productionId}', '{productionId}')
    .replaceAll('{segmentId}', '{segmentId}')
    .replaceAll('{sceneMomentId}', '{sceneMomentId}')
    .replaceAll('{storyboardId}', '{storyboardId}')
    .replaceAll('{contentUnitId}', '{contentUnitId}'))
}

function normalizeEntityKind(entityKind: string): string {
  return entityKind.trim().replace(/^movscript\./, '').replace(/\.v\d+$/, '')
}

function isSemanticEntityKind(value: string): value is SemanticEntityKind {
  return Object.values(WORKSPACE_ENTITY_KIND).includes(value as SemanticEntityKind)
}
