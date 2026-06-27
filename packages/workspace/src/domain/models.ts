import {
  entityPathSlug,
  safeWorkspacePathToken,
} from '../layout/index.js'
import {
  MOVSCRIPT_DOMAIN_PATH_SEMANTICS,
  type MovScriptDomainPathSemantics,
} from '@movscript/domain'
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
                { kind: 'expression_unit_workspace', children: [
                  { kind: 'keyframe_workspace', children: [] },
                  { kind: 'storyboard_workspace', children: [] },
                ] },
                { kind: 'keyframe_workspace', children: [] },
                { kind: 'storyboard_workspace', children: [] },
                { kind: 'audio_cue_workspace', children: [] },
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
  pathSemantics: MovScriptDomainPathSemantics
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
    instructions: ['Use setting workspaces for concrete film/music production entities to be made or reused, such as characters, props, places, instruments, costumes, or voice identities. Do not use settings for abstract styles or rules; put project-wide style/rules in project standards. Child setting namespaces/states are organized by their actual source path; namespace_kind only labels that path level. Assets belong under setting states.'],
  },
  setting_state_workspace: {
    kind: 'setting_state_workspace',
    title: 'Setting state workspace',
    entityKinds: ['setting_state'],
    editablePathPatterns: ['settings/{settingSlug}/states/{settingStateSlug}/setting_state.json'],
    contextPathPatterns: ['settings/{settingSlug}/setting.json', 'project_standards.json'],
    schemaIds: ['movscript.setting_state.v1'],
    instructions: ['Use setting state workspaces as namespaces under a setting for named conditions or versions of the same entity, such as base look, wet hair, damaged prop, side-view variant, or calm voice. The default states/ path is a legacy hint; custom setting namespace paths are valid when setting_state.json sits under the intended setting parent.'],
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
    instructions: ['Assets are setting-state-owned resource slots and carriers for asset_ref content-unit generation/review. The owning setting state is the nearest setting_state ancestor in the source path, not a fixed states/ directory. Do not write new candidates or selections into asset.json; generated asset candidates belong to the linked asset_ref content unit and backend content-unit decision flow. Existing inline candidates/selection in asset.json are legacy compatibility data only. Downstream content-unit prompts can reference selected asset outputs with {{asset::id}} when dependency tracking matters; loose raw-resource guidance can use direct resource inputs. Image assets should prefer plain white or very clean backgrounds.'],
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
    instructions: ['Production records are legacy/default timeline namespace nodes. Edit existing custom timeline namespace nodes in place; for new custom layouts, put production.json under the intended timeline path and set namespace_kind to the user-facing namespace label. Segment and scene moment children hold planning structure through path ancestry.'],
  },
  segment_workspace: {
    kind: 'segment_workspace',
    title: 'Segment workspace',
    entityKinds: ['segment'],
    editablePathPatterns: ['productions/{productionSlug}/segments/{segmentSlug}/segment.json'],
    contextPathPatterns: ['productions/{productionSlug}/production.json'],
    schemaIds: ['movscript.segment.v1'],
    instructions: ['Segment records are legacy/default timeline namespace nodes for rhythm sections. Edit existing custom namespace nodes in place; for new custom layouts, put segment.json under the intended timeline parent path and set namespace_kind to the user-facing label. Order lives in segment.json, not the directory name.'],
  },
  scene_moment_workspace: {
    kind: 'scene_moment_workspace',
    title: 'Scene moment workspace',
    entityKinds: ['scene_moment'],
    editablePathPatterns: ['productions/{productionSlug}/segments/{segmentSlug}/scene_moments/{sceneMomentSlug}/scene_moment.json'],
    contextPathPatterns: ['productions/{productionSlug}/segments/{segmentSlug}/segment.json', 'settings/**'],
    schemaIds: ['movscript.scene_moment.v1'],
    instructions: ['Scene moments are stable production primitives and should remain under the intended timeline namespace path. They describe planning context and their own transition boundaries. Shot semantics live as expression_unit records with kind=shot; storyboards and keyframes may be direct scene moment children when they are scene-scoped.'],
  },
  storyboard_workspace: {
    kind: 'storyboard_workspace',
    title: 'Storyboard workspace',
    entityKinds: ['storyboard'],
    editablePathPatterns: [
      'productions/{productionSlug}/segments/{segmentSlug}/scene_moments/{sceneMomentSlug}/expression_units/{expressionUnitSlug}/storyboards/{storyboardSlug}/storyboard.json',
      'productions/{productionSlug}/segments/{segmentSlug}/scene_moments/{sceneMomentSlug}/storyboards/{storyboardSlug}/storyboard.json',
    ],
    contextPathPatterns: ['productions/**', 'settings/**', 'project_standards.json'],
    schemaIds: ['movscript.storyboard.v1'],
    instructions: ['Storyboards are production primitives under expression_unit(kind=shot) or directly under scene_moment. Runtime candidates and production decisions are stored outside storyboard.json. Downstream prompts can reference selected storyboard outputs with {{storyboard::id}} when dependency tracking matters; loose raw-resource guidance can use direct resource inputs.'],
  },
  audio_cue_workspace: {
    kind: 'audio_cue_workspace',
    title: 'Audio cue workspace',
    entityKinds: ['audio_cue'],
    editablePathPatterns: ['productions/{productionSlug}/segments/{segmentSlug}/scene_moments/{sceneMomentSlug}/audio_cues/{audioCueSlug}/audio_cue.json'],
    contextPathPatterns: [
      'productions/{productionSlug}/segments/{segmentSlug}/scene_moments/{sceneMomentSlug}/scene_moment.json',
      'productions/{productionSlug}/segments/{segmentSlug}/scene_moments/{sceneMomentSlug}/expression_units/**',
      'settings/**',
      'project_standards.json',
    ],
    schemaIds: ['movscript.audio_cue.v1'],
    instructions: ['Audio cues are production primitives for sound, music, ambience, dialogue, or foley planning, normally parented by source path under a scene moment and optionally attached by refs to scene moments, storyboards, or shot plans.'],
  },
  expression_unit_workspace: {
    kind: 'expression_unit_workspace',
    title: 'Expression unit workspace',
    entityKinds: ['expression_unit'],
    editablePathPatterns: ['productions/{productionSlug}/segments/{segmentSlug}/scene_moments/{sceneMomentSlug}/expression_units/{expressionUnitSlug}/expression_unit.json'],
    contextPathPatterns: [
      'productions/{productionSlug}/segments/{segmentSlug}/scene_moments/{sceneMomentSlug}/scene_moment.json',
      'productions/{productionSlug}/segments/{segmentSlug}/scene_moments/{sceneMomentSlug}/expression_units/**',
    ],
    schemaIds: ['movscript.expression_unit.v1'],
    instructions: ['Expression units are scene-moment-owned production primitives. Their owning scene moment is the nearest scene_moment ancestor in the source path. Use expression_kind/kind=shot for makeable shot units; storyboard/keyframe records may be children of that expression unit.'],
  },
  content_unit_workspace: {
    kind: 'content_unit_workspace',
    title: 'Content unit workspace',
    entityKinds: ['content_unit'],
    editablePathPatterns: ['content_units/{contentUnitSlug}/content_unit.json'],
    contextPathPatterns: ['project_standards.json', 'settings/**', 'productions/**'],
    schemaIds: ['movscript.content_unit.v1'],
    instructions: ['Content units are project-level stable production units. They declare content_unit_type, output_kind, flat business refs, edit_prompt, and model_intent. Specialized content_unit_type adapters perform dependency and regeneration checks; unknown types are valid but untracked for regeneration. Use expression_unit_ref for shot expression units, keyframe_ref/storyboard_ref for visual anchors, audio_cue_ref for sound cues, and timeline_assembly_ref for namespace-scope assembly. In edit_prompt, use semantic refs such as {{asset::id}}, {{storyboard::id}}, {{keyframe::id}}, {{audio_cue::id}}, {{candidate::id}}, or {{resource::123}}; prompt compilation resolves selected backend candidates into resource mentions and resource_ids for generation.'],
  },
  keyframe_workspace: {
    kind: 'keyframe_workspace',
    title: 'Keyframe workspace',
    entityKinds: ['keyframe'],
    editablePathPatterns: [
      'productions/{productionSlug}/segments/{segmentSlug}/scene_moments/{sceneMomentSlug}/expression_units/{expressionUnitSlug}/keyframes/{keyframeSlug}/keyframe.json',
      'productions/{productionSlug}/segments/{segmentSlug}/scene_moments/{sceneMomentSlug}/keyframes/{keyframeSlug}/keyframe.json',
    ],
    contextPathPatterns: ['settings/**', 'project_standards.json', 'productions/**'],
    schemaIds: ['movscript.keyframe.v1'],
    instructions: ['Keyframes are production primitives and visual anchors under expression_unit(kind=shot) or directly under scene_moment. Content units reference keyframes through keyframe_ref or keyframe_refs.'],
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
    pathSemantics: MOVSCRIPT_DOMAIN_PATH_SEMANTICS,
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
  return Object.values(WORKSPACE_ENTITY_KIND).some((kind) => kind === value)
}
