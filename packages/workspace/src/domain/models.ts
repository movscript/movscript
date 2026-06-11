import {
  entityPathSlug,
  safeWorkspacePathToken,
} from '../layout/index.js'
import type { SemanticEntityKind, WorkspaceKind } from '@movscript/language/domain'

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
  shot_workspace: 'shot'
  storyboard_workspace: 'storyboard'
  audio_cue_workspace: 'audio_cue'
  expression_unit_workspace: 'expression_unit'
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
  shot_workspace: 'shot',
  storyboard_workspace: 'storyboard',
  audio_cue_workspace: 'audio_cue',
  expression_unit_workspace: 'expression_unit',
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
      children: [],
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
                { kind: 'shot_workspace', children: [
                  { kind: 'keyframe_workspace', children: [] },
                  { kind: 'storyboard_workspace', children: [] },
                ] },
                { kind: 'audio_cue_workspace', children: [] },
                { kind: 'expression_unit_workspace', children: [] },
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
    instructions: ['Edit the project root entity in project.json. Interpret validates the source tree and writes .derived artifacts.'],
  },
  project_standards_workspace: {
    kind: 'project_standards_workspace',
    title: 'Project standards workspace',
    entityKinds: ['project_standards'],
    editablePathPatterns: ['project_standards.json'],
    contextPathPatterns: ['project.json'],
    schemaIds: ['movscript.project_standards.v1'],
    instructions: ['Edit project-wide creative standards in project_standards.json. Interpret uses these standards when deriving generation context.'],
  },
  setting_workspace: {
    kind: 'setting_workspace',
    title: 'Setting workspace',
    entityKinds: ['setting'],
    editablePathPatterns: ['settings/{settingSlug}/setting.json'],
    contextPathPatterns: ['project.json', 'project_standards.json'],
    schemaIds: ['movscript.setting.v1'],
    instructions: ['Use setting workspaces for characters, locations, props, world rules, and style facts. Assets belong under setting states.'],
  },
  setting_state_workspace: {
    kind: 'setting_state_workspace',
    title: 'Setting state workspace',
    entityKinds: ['setting_state'],
    editablePathPatterns: ['settings/{settingSlug}/states/{settingStateSlug}/setting_state.json'],
    contextPathPatterns: ['settings/{settingSlug}/setting.json', 'project_standards.json'],
    schemaIds: ['movscript.setting_state.v1'],
    instructions: ['Use setting state workspaces for conditional state such as wet hair, damaged prop, or rainy location variants.'],
  },
  asset_workspace: {
    kind: 'asset_workspace',
    title: 'Asset workspace',
    entityKinds: ['asset'],
    editablePathPatterns: [
      'settings/{settingSlug}/states/{settingStateSlug}/assets/{assetSlug}/asset.json',
    ],
    contextPathPatterns: ['settings/{settingSlug}/setting.json', 'settings/{settingSlug}/states/{settingStateSlug}/setting_state.json', 'project_standards.json'],
    schemaIds: ['movscript.asset.v1'],
    instructions: ['Assets are setting-state-owned resource slots. Runtime candidates and production decisions are stored outside asset.json.'],
  },
  script_workspace: {
    kind: 'script_workspace',
    title: 'Script workspace',
    entityKinds: ['script'],
    editablePathPatterns: ['scripts/{scriptSlug}/script.json', 'scripts/{scriptSlug}/script.md'],
    contextPathPatterns: ['project.json'],
    schemaIds: ['movscript.script.v1'],
    instructions: ['Use script workspaces for screenplay roots and source text references.'],
  },
  script_version_workspace: {
    kind: 'script_version_workspace',
    title: 'Script version workspace',
    entityKinds: ['script_version'],
    editablePathPatterns: ['scripts/{scriptSlug}/versions/{scriptVersionSlug}/script_version.json'],
    contextPathPatterns: ['scripts/{scriptSlug}/script.json'],
    schemaIds: ['movscript.script_version.v1'],
    instructions: ['Use script version workspaces for versioned script snapshots and block grouping.'],
  },
  script_block_workspace: {
    kind: 'script_block_workspace',
    title: 'Script block workspace',
    entityKinds: ['script_block'],
    editablePathPatterns: ['scripts/{scriptSlug}/versions/{scriptVersionSlug}/blocks/{scriptBlockSlug}/script_block.json'],
    contextPathPatterns: ['scripts/{scriptSlug}/versions/{scriptVersionSlug}/script_version.json'],
    schemaIds: ['movscript.script_block.v1'],
    instructions: ['Use script block workspaces for addressable text blocks referenced by planning entities.'],
  },
  production_workspace: {
    kind: 'production_workspace',
    title: 'Production workspace',
    entityKinds: ['production'],
    editablePathPatterns: ['productions/{productionSlug}/production.json'],
    contextPathPatterns: ['project.json', 'project_standards.json', 'settings/**', 'scripts/**'],
    schemaIds: ['movscript.production.v1'],
    instructions: ['Edit production roots under productions/. Segment and scene moment children hold the planning structure.'],
  },
  segment_workspace: {
    kind: 'segment_workspace',
    title: 'Segment workspace',
    entityKinds: ['segment'],
    editablePathPatterns: ['productions/{productionSlug}/segments/{segmentSlug}/segment.json'],
    contextPathPatterns: ['productions/{productionSlug}/production.json'],
    schemaIds: ['movscript.segment.v1'],
    instructions: ['Use segment workspaces for rhythm sections inside a production. Order lives in segment.json, not the directory name.'],
  },
  scene_moment_workspace: {
    kind: 'scene_moment_workspace',
    title: 'Scene moment workspace',
    entityKinds: ['scene_moment'],
    editablePathPatterns: ['productions/{productionSlug}/segments/{segmentSlug}/scene_moments/{sceneMomentSlug}/scene_moment.json'],
    contextPathPatterns: ['productions/{productionSlug}/segments/{segmentSlug}/segment.json', 'settings/**'],
    schemaIds: ['movscript.scene_moment.v1'],
    instructions: ['Scene moments describe planning context and their own transition boundaries. Shots are the primary children.'],
  },
  shot_workspace: {
    kind: 'shot_workspace',
    title: 'Shot workspace',
    entityKinds: ['shot'],
    editablePathPatterns: ['productions/{productionSlug}/segments/{segmentSlug}/scene_moments/{sceneMomentSlug}/shots/{shotSlug}/shot.json'],
    contextPathPatterns: ['productions/{productionSlug}/segments/{segmentSlug}/scene_moments/{sceneMomentSlug}/scene_moment.json', 'settings/**', 'project_standards.json'],
    schemaIds: ['movscript.shot.v1'],
    instructions: ['Shots are makeable camera units inside scene moments. Keyframes and storyboards are shot-owned children.'],
  },
  storyboard_workspace: {
    kind: 'storyboard_workspace',
    title: 'Storyboard workspace',
    entityKinds: ['storyboard'],
    editablePathPatterns: [
      'productions/{productionSlug}/segments/{segmentSlug}/scene_moments/{sceneMomentSlug}/shots/{shotSlug}/storyboards/{storyboardSlug}/storyboard.json',
    ],
    contextPathPatterns: ['productions/**', 'settings/**', 'project_standards.json'],
    schemaIds: ['movscript.storyboard.v1'],
    instructions: ['Storyboards are shot-owned graph assets, similar to asset slots. Runtime candidates and production decisions are stored outside storyboard.json.'],
  },
  audio_cue_workspace: {
    kind: 'audio_cue_workspace',
    title: 'Audio cue workspace',
    entityKinds: ['audio_cue'],
    editablePathPatterns: ['productions/{productionSlug}/segments/{segmentSlug}/scene_moments/{sceneMomentSlug}/audio_cues/{audioCueSlug}/audio_cue.json'],
    contextPathPatterns: [
      'productions/{productionSlug}/segments/{segmentSlug}/scene_moments/{sceneMomentSlug}/scene_moment.json',
      'productions/{productionSlug}/segments/{segmentSlug}/scene_moments/{sceneMomentSlug}/shots/**',
      'settings/**',
      'project_standards.json',
    ],
    schemaIds: ['movscript.audio_cue.v1'],
    instructions: ['Audio cues are independent sound, music, ambience, dialogue, or foley planning objects attached by refs to scene moments, storyboards, or shot plans.'],
  },
  expression_unit_workspace: {
    kind: 'expression_unit_workspace',
    title: 'Expression unit workspace',
    entityKinds: ['expression_unit'],
    editablePathPatterns: ['productions/{productionSlug}/segments/{segmentSlug}/scene_moments/{sceneMomentSlug}/expression_units/{expressionUnitSlug}/expression_unit.json'],
    contextPathPatterns: [
      'productions/{productionSlug}/segments/{segmentSlug}/scene_moments/{sceneMomentSlug}/scene_moment.json',
      'productions/{productionSlug}/segments/{segmentSlug}/scene_moments/{sceneMomentSlug}/shots/**',
    ],
    schemaIds: ['movscript.expression_unit.v1'],
    instructions: ['Expression units are scene-moment-owned semantic expressions. They may span multiple storyboards, but their ownership stays with the scene moment.'],
  },
  content_unit_workspace: {
    kind: 'content_unit_workspace',
    title: 'Content unit workspace',
    entityKinds: ['content_unit'],
    editablePathPatterns: ['content_units/{contentUnitSlug}/content_unit.json'],
    contextPathPatterns: ['project_standards.json', 'settings/**', 'productions/**'],
    schemaIds: ['movscript.content_unit.v1'],
    instructions: ['Content units are project-level stable production units. They declare content_unit_type, output_kind, flat business refs, edit_prompt, and model_intent. Specialized content_unit_type adapters perform dependency and regeneration checks; unknown types are valid but untracked for regeneration. Use keyframe_ref content units to reference Keyframe entities owned by storyboards.'],
  },
  keyframe_workspace: {
    kind: 'keyframe_workspace',
    title: 'Keyframe workspace',
    entityKinds: ['keyframe'],
    editablePathPatterns: [
      'productions/{productionSlug}/segments/{segmentSlug}/scene_moments/{sceneMomentSlug}/shots/{shotSlug}/keyframes/{keyframeSlug}/keyframe.json',
    ],
    contextPathPatterns: ['settings/**', 'project_standards.json', 'productions/**'],
    schemaIds: ['movscript.keyframe.v1'],
    instructions: ['Keyframes are visual anchors owned by shots. Content units reference keyframes through keyframe_ref or keyframe_refs.'],
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
  const model = MOVSCRIPT_DOMAIN_WORKSPACE_MODELS[kind]
  if (!model) throw new Error(`Unsupported MovScript workspace kind: ${kind}`)
  return model
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
  const slug = input.entityId === undefined ? undefined : entityPathSlug(input.entityId, normalizeEntityKind(input.entityKind))
  return patterns.map((pattern) => pattern
    .replaceAll('{id}', slug ?? '{id}')
    .replaceAll(`{${camelEntityKind(input.entityKind)}Slug}`, slug ?? `{${camelEntityKind(input.entityKind)}Slug}`))
}

function camelEntityKind(entityKind: string): string {
  return normalizeEntityKind(entityKind).replace(/_([a-z])/g, (_match, char: string) => char.toUpperCase())
}

function normalizeEntityKind(entityKind: string): string {
  return entityKind.trim().replace(/^movscript\./, '').replace(/\.v\d+$/, '')
}

function isSemanticEntityKind(value: string): value is SemanticEntityKind {
  return Object.values(WORKSPACE_ENTITY_KIND).includes(value as SemanticEntityKind)
}
