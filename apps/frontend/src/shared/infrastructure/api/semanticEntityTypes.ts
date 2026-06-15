export type SemanticEntityKind =
  | 'scriptVersions'
  | 'scriptBlocks'
  | 'segments'
  | 'productionTextBlocks'
  | 'sceneMoments'
  | 'expressionUnits'
  | 'productions'
  | 'storyboardScripts'
  | 'storyboardVersions'
  | 'contentUnits'
  | 'keyframes'
  | 'previewTimelines'
  | 'previewTimelineItems'
  | 'settings'
  | 'settingStates'
  | 'settingUsages'
  | 'creativeRelationships'
  | 'assetSlots'
  | 'assetSlotCandidates'
  | 'candidateDecisions'
  | 'reviewEvents'
  | 'canvasOutputs'

export type SemanticEntityRecord = Record<string, unknown> & {
  ID: number
  CreatedAt?: string
  UpdatedAt?: string
  project_id?: number
  title?: string
  name?: string
  label?: string
  status?: string
  review_status?: string
  kind?: string
  order?: number
}

export interface SemanticEntityOption {
  value: string
  label: string
}

export interface SemanticEntityField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'boolean'
  required?: boolean
  placeholder?: string
  options?: SemanticEntityOption[]
  createOnly?: boolean
  helper?: string
}

export type SemanticEntityAccent =
  | 'neutral'
  | 'sky'
  | 'cyan'
  | 'blue'
  | 'teal'
  | 'emerald'
  | 'lime'
  | 'amber'
  | 'orange'
  | 'rose'
  | 'violet'
  | 'indigo'

export interface SemanticEntityConfig {
  kind: SemanticEntityKind
  path: string
  label: string
  pluralLabel: string
  description: string
  requiredHint?: string
  iconTone: SemanticEntityAccent
  fields: SemanticEntityField[]
  summaryKeys: string[]
}

export type SemanticEntityPayload = Record<string, string | number | boolean | null>
export type SemanticEntityListParams = Record<string, string | number | boolean | null | undefined>

export interface Project {
  ID: number
  name: string
  description: string
  owner_id: number
  owner?: { ID: number; username: string; system_role: 'super_admin' | 'user' }
  total_episodes?: number
  aspect_ratio?: string
  visual_style?: string
  project_style?: string
  CreatedAt: string
  UpdatedAt: string
}

export interface EntityRelation extends SemanticEntityRecord {
  project_id: number
  source_type: string
  source_id: number
  target_type: string
  target_id: number
  category: string
  type: string
  direction: string
  weight: number
  source: string
}

export interface EntityRelationFilters {
  category?: string
  type?: string
  source_type?: string
  source_id?: number
  target_type?: string
  target_id?: number
  status?: string
}

export interface ScriptBlockUsages {
  segments: SemanticEntityRecord[]
  scene_moments: SemanticEntityRecord[]
  content_units: SemanticEntityRecord[]
}

export interface SourceLockStatus {
  entity_kind: string
  entity_id: number
  locked: boolean
  locked_fields: string[]
  reasons: Array<{ code: string; message: string; entity_kind: string; count: number }>
}

export interface GenerationContext {
  target: {
    type: 'content_unit'
    content_unit: SemanticEntityRecord
  }
  intent: 'keyframe' | 'video'
  production?: SemanticEntityRecord
  segment?: SemanticEntityRecord
  scene_moment?: SemanticEntityRecord
  script_block?: SemanticEntityRecord
  settings: Array<{ usage: SemanticEntityRecord; reference?: SemanticEntityRecord; state?: SemanticEntityRecord }>
  asset_slots: SemanticEntityRecord[]
  keyframes: SemanticEntityRecord[]
  constraints: {
    read_only_entities: string[]
    write_targets: string[]
  }
}

export interface AbandonSegmentResult {
  segment_id: number
  scene_moments_updated: number
  content_units_updated: number
  timeline_items_removed: number
}

export interface AbandonSceneMomentResult {
  scene_moment_id: number
  content_units_updated: number
  timeline_items_removed: number
}

export interface AbandonContentUnitResult {
  content_unit_id: number
  timeline_items_removed: number
}
