import {
  listSemanticEntities,
  semanticEntityConfig,
  type SemanticEntityKind,
  type SemanticEntityRecord,
} from '@/api/semanticEntities'
import type { ProductionWritingExpressionType as WritingExpressionType } from '@/lib/productionWritingExpressions'

export type ProductionRecord = SemanticEntityRecord & { script_version_id?: number; name?: string }

export type SegmentRecord = SemanticEntityRecord & {
  production_id?: number
  title?: string
  kind?: string
  summary?: string
  content?: string
  source_range?: string
  order?: number
  status?: string
  script_version_id?: number
  script_block_id?: number
}

export type SceneMomentRecord = SemanticEntityRecord & {
  production_id?: number
  segment_id?: number
  scene_code?: string
  title?: string
  time_text?: string
  location_text?: string
  action_text?: string
  condition_text?: string
  mood?: string
  order?: number
  status?: string
  description?: string
  script_block_id?: number
}

export type CreativeReferenceRecord = SemanticEntityRecord & {
  name?: string
  kind?: string
  importance?: string
  status?: string
  description?: string
  content?: string
  alias?: string
}

export type AssetSlotRecord = SemanticEntityRecord & {
  production_id?: number
  name?: string
  kind?: string
  priority?: string
  status?: string
  description?: string
  owner_type?: string
  owner_id?: number
  creative_reference_id?: number
  creative_reference_state_id?: number
}

export type ContentUnitRecord = SemanticEntityRecord & {
  production_id?: number
  segment_id?: number
  scene_moment_id?: number
  title?: string
  kind?: string
  unit_code?: string
  order?: number
  duration_sec?: number
  description?: string
  shot_size?: string
  camera_angle?: string
  camera_motion?: string
  status?: string
  prompt?: string
  script_block_id?: number
}

export type ScriptBlockRecord = SemanticEntityRecord & {
  script_id?: number
  script_version_id?: number
  parent_block_id?: number
  kind?: string
  speaker?: string
  content?: string
  summary?: string
  title?: string
  order?: number
  status?: string
  start_line?: number
  end_line?: number
}

export type WritingExpressionRecord = SemanticEntityRecord & {
  scene_moment_id?: number
  script_block_id?: number
  kind?: WritingExpressionType
  speaker?: string
  text?: string
  note?: string
  intent?: string
  order?: number
}

export type KeyframeRecord = SemanticEntityRecord & {
  production_id?: number
  scene_moment_id?: number
  content_unit_id?: number
  title?: string
  description?: string
  prompt?: string
  order?: number
  status?: string
}

export interface OrchestrationData {
  productions: ProductionRecord[]
  segments: SegmentRecord[]
  sceneMoments: SceneMomentRecord[]
  creativeReferences: CreativeReferenceRecord[]
  creativeReferenceUsages: SemanticEntityRecord[]
  assetSlots: AssetSlotRecord[]
  contentUnits: ContentUnitRecord[]
  scriptBlocks: ScriptBlockRecord[]
  writingExpressions: WritingExpressionRecord[]
  keyframes: KeyframeRecord[]
}

export const PRODUCTION_ORCHESTRATION_ENTITY_KINDS = [
  'productions',
  'segments',
  'sceneMoments',
  'creativeReferences',
  'creativeReferenceUsages',
  'assetSlots',
  'contentUnits',
  'scriptBlocks',
  'writingExpressions',
  'keyframes',
] as const satisfies readonly SemanticEntityKind[]

export async function loadProductionOrchestrationData(projectId: number): Promise<OrchestrationData> {
  const [
    productions,
    segments,
    sceneMoments,
    creativeReferences,
    creativeReferenceUsages,
    assetSlots,
    contentUnits,
    scriptBlocks,
    writingExpressions,
    keyframes,
  ] = await Promise.all(PRODUCTION_ORCHESTRATION_ENTITY_KINDS.map((kind) => listSemanticEntities(projectId, semanticEntityConfig(kind))))

  return {
    productions: productions as ProductionRecord[],
    segments: segments as SegmentRecord[],
    sceneMoments: sceneMoments as SceneMomentRecord[],
    creativeReferences: creativeReferences as CreativeReferenceRecord[],
    creativeReferenceUsages,
    assetSlots: assetSlots as AssetSlotRecord[],
    contentUnits: contentUnits as ContentUnitRecord[],
    scriptBlocks: scriptBlocks as ScriptBlockRecord[],
    writingExpressions: writingExpressions as WritingExpressionRecord[],
    keyframes: keyframes as KeyframeRecord[],
  }
}
