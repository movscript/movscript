import type { PipelineContentType } from '@/types'

export type PipelineNodeCategory = 'work' | 'custom'
export type PipelineEntityType = 'script' | 'setting' | 'storyboard' | 'shot' | 'asset' | 'episode' | 'scene' | 'final_video'
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
  setting_creation:    { type: 'setting_creation',    category: 'work',     contentType: 'setting',    entityType: 'setting', canCreateEntity: false, canLinkEntity: false },
  episode_writing:     { type: 'episode_writing',     category: 'work',     contentType: 'script',     canCreateEntity: false, canLinkEntity: false },
  scene_writing:       { type: 'scene_writing',       category: 'work',     contentType: 'script',     canCreateEntity: false, canLinkEntity: false },
  storyboard_creation: { type: 'storyboard_creation', category: 'work',     contentType: 'storyboard', canCreateEntity: false, canLinkEntity: false },
  asset_creation:      { type: 'asset_creation',      category: 'work',     contentType: 'asset',      canCreateEntity: false, canLinkEntity: false },
  raw_script:          { type: 'raw_script',          category: 'work',     contentType: 'script',     canCreateEntity: false, canLinkEntity: false },
  shot_production:     { type: 'shot_production',     category: 'work',     contentType: 'shot',       canCreateEntity: false, canLinkEntity: false },
  episode_edit:        { type: 'episode_edit',        category: 'work',     contentType: 'final_video', canCreateEntity: false, canLinkEntity: false },

  custom: { type: 'custom', category: 'custom', contentType: 'custom', canCreateEntity: false, canLinkEntity: false },
}

export const WORK_NODE_TYPES = Object.values(PIPELINE_NODE_SPECS)
  .filter((spec) => spec.category === 'work' && spec.type !== 'raw_script')
  .map((spec) => spec.type)

export const NODE_TYPE_OPTIONS = [...WORK_NODE_TYPES, 'custom']

export function getPipelineNodeSpec(type: string): PipelineNodeSpec {
  return PIPELINE_NODE_SPECS[type] ?? PIPELINE_NODE_SPECS.custom
}

export function defaultContentType(type: string): PipelineContentType {
  return getPipelineNodeSpec(type).contentType
}

export function scriptTypeForPipelineNode(type: string): PipelineScriptType {
  if (type === 'episode_writing') return 'episode'
  if (type === 'scene_writing') return 'scene'
  return 'main'
}
