import type { PipelineContentType } from '@/types'

export type PipelineNodeCategory = 'work' | 'artifact' | 'custom'
export type PipelineEntityType = 'script' | 'storyboard' | 'shot' | 'asset' | 'episode' | 'scene'
export type PipelineScriptType = 'main' | 'episode' | 'scene'

export interface PipelineNodeSpec {
  type: string
  category: PipelineNodeCategory
  contentType: PipelineContentType
  entityType?: PipelineEntityType
  canCreateEntity: boolean
  canLinkEntity: boolean
}

export const PIPELINE_NODE_SPECS: Record<string, PipelineNodeSpec> = {
  script_writing:      { type: 'script_writing',      category: 'work',     contentType: 'script',     canCreateEntity: false, canLinkEntity: false },
  episode_writing:     { type: 'episode_writing',     category: 'work',     contentType: 'script',     canCreateEntity: false, canLinkEntity: false },
  scene_writing:       { type: 'scene_writing',       category: 'work',     contentType: 'script',     canCreateEntity: false, canLinkEntity: false },
  storyboard_creation: { type: 'storyboard_creation', category: 'work',     contentType: 'storyboard', canCreateEntity: false, canLinkEntity: false },
  asset_creation:      { type: 'asset_creation',      category: 'work',     contentType: 'asset',      canCreateEntity: false, canLinkEntity: false },
  raw_script:          { type: 'raw_script',          category: 'work',     contentType: 'script',     canCreateEntity: false, canLinkEntity: false },
  shot_production:     { type: 'shot_production',     category: 'work',     contentType: 'shot',       canCreateEntity: false, canLinkEntity: false },
  episode_edit:        { type: 'episode_edit',        category: 'work',     contentType: 'final_video', canCreateEntity: false, canLinkEntity: false },

  main_script:       { type: 'main_script',       category: 'artifact', contentType: 'script',     entityType: 'script',     canCreateEntity: true, canLinkEntity: true },
  episode_script:    { type: 'episode_script',    category: 'artifact', contentType: 'script',     entityType: 'script',     canCreateEntity: true, canLinkEntity: true },
  scene_script:      { type: 'scene_script',      category: 'artifact', contentType: 'script',     entityType: 'script',     canCreateEntity: true, canLinkEntity: true },
  storyboard_script: { type: 'storyboard_script', category: 'artifact', contentType: 'storyboard', entityType: 'storyboard', canCreateEntity: true, canLinkEntity: true },
  episode:           { type: 'episode',           category: 'artifact', contentType: 'episode',    entityType: 'episode',    canCreateEntity: true, canLinkEntity: true },
  scene:             { type: 'scene',             category: 'artifact', contentType: 'scene',      entityType: 'scene',      canCreateEntity: true, canLinkEntity: true },
  storyboard:        { type: 'storyboard',        category: 'artifact', contentType: 'storyboard', entityType: 'storyboard', canCreateEntity: true, canLinkEntity: true },
  asset:             { type: 'asset',             category: 'artifact', contentType: 'asset',      entityType: 'asset',      canCreateEntity: true, canLinkEntity: true },
  shot:              { type: 'shot',              category: 'artifact', contentType: 'shot',       entityType: 'shot',       canCreateEntity: true, canLinkEntity: true },
  final_video:       { type: 'final_video',       category: 'artifact', contentType: 'final_video',                       canCreateEntity: false, canLinkEntity: false },

  custom: { type: 'custom', category: 'custom', contentType: 'custom', canCreateEntity: false, canLinkEntity: false },
}

export const WORK_NODE_TYPES = Object.values(PIPELINE_NODE_SPECS)
  .filter((spec) => spec.category === 'work')
  .map((spec) => spec.type)

export const ARTIFACT_NODE_TYPES = Object.values(PIPELINE_NODE_SPECS)
  .filter((spec) => spec.category === 'artifact')
  .map((spec) => spec.type)

export const NODE_TYPE_OPTIONS = [...WORK_NODE_TYPES, ...ARTIFACT_NODE_TYPES, 'custom']

export function getPipelineNodeSpec(type: string): PipelineNodeSpec {
  return PIPELINE_NODE_SPECS[type] ?? PIPELINE_NODE_SPECS.custom
}

export function defaultContentType(type: string): PipelineContentType {
  return getPipelineNodeSpec(type).contentType
}

export function entityTypeForNode(type: string): PipelineEntityType | undefined {
  return getPipelineNodeSpec(type).entityType
}

export function scriptTypeForPipelineNode(type: string): PipelineScriptType {
  if (type === 'episode_writing' || type === 'episode_script') return 'episode'
  if (type === 'scene_writing' || type === 'scene_script') return 'scene'
  return 'main'
}

export function nodeTypeForEntity(entityType: PipelineEntityType, preferredScriptType?: 'main' | 'episode' | 'scene') {
  if (entityType === 'script') {
    if (preferredScriptType === 'main') return 'main_script'
    if (preferredScriptType === 'episode') return 'episode_script'
    if (preferredScriptType === 'scene') return 'scene_script'
    return 'main_script'
  }
  return entityType
}
