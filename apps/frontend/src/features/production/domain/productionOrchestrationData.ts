import {
  listSemanticEntities,
  semanticEntityConfig,
  type SemanticEntityKind,
  type SemanticEntityRecord,
} from '@/shared/infrastructure/api/semanticEntities'
import { api } from '@/shared/infrastructure/api'
import { isActiveSemanticEntityRecord } from '@/shared/domain/semanticEntityVisibility'
import type { ProductionWritingExpressionType as WritingExpressionType } from '@/features/production/domain/productionWritingExpressions'
import type { Job } from '@/types'

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

export type SettingRecord = SemanticEntityRecord & {
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
  setting_id?: number
  setting_state_id?: number
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
  settings: SettingRecord[]
  settingUsages: SemanticEntityRecord[]
  assetSlots: AssetSlotRecord[]
  contentUnits: ContentUnitRecord[]
  scriptBlocks: ScriptBlockRecord[]
  writingExpressions: WritingExpressionRecord[]
  keyframes: KeyframeRecord[]
  previewTimelines: SemanticEntityRecord[]
  previewTimelineItems: SemanticEntityRecord[]
  deliveryVersions: SemanticEntityRecord[]
  jobs: Job[]
}

export function isActiveProductionOrchestrationRecord(record: SemanticEntityRecord) {
  return isActiveSemanticEntityRecord(record)
}

export const PRODUCTION_ORCHESTRATION_ENTITY_KINDS = [
  'productions',
  'segments',
  'sceneMoments',
  'settings',
  'settingUsages',
  'assetSlots',
  'contentUnits',
  'scriptBlocks',
  'writingExpressions',
  'keyframes',
  'previewTimelines',
  'previewTimelineItems',
  'deliveryVersions',
] as const satisfies readonly SemanticEntityKind[]

export async function loadProductionOrchestrationData(projectId: number): Promise<OrchestrationData> {
  const [
    productions,
    segments,
    sceneMoments,
    settings,
    settingUsages,
    assetSlots,
    contentUnits,
    scriptBlocks,
    writingExpressions,
    keyframes,
    previewTimelines,
    previewTimelineItems,
    deliveryVersions,
  ] = await Promise.all(PRODUCTION_ORCHESTRATION_ENTITY_KINDS.map((kind) => listSemanticEntities(projectId, semanticEntityConfig(kind))))

  return {
    productions: productions as ProductionRecord[],
    segments: (segments as SegmentRecord[]).filter(isActiveProductionOrchestrationRecord),
    sceneMoments: (sceneMoments as SceneMomentRecord[]).filter(isActiveProductionOrchestrationRecord),
    settings: settings as SettingRecord[],
    settingUsages,
    assetSlots: assetSlots as AssetSlotRecord[],
    contentUnits: (contentUnits as ContentUnitRecord[]).filter(isActiveProductionOrchestrationRecord),
    scriptBlocks: scriptBlocks as ScriptBlockRecord[],
    writingExpressions: writingExpressions as WritingExpressionRecord[],
    keyframes: keyframes as KeyframeRecord[],
    previewTimelines,
    previewTimelineItems,
    deliveryVersions,
    jobs: await loadProductionOrchestrationJobs(projectId, ['image', 'image_edit', 'video', 'video_i2v', 'video_v2v']),
  }
}

export async function loadProductionOrchestrationJobs(projectId: number, types: string[]) {
  const batches = await Promise.all(types.map((type) => (
    api.get<Job[]>('/jobs', {
      params: {
        project_id: projectId,
        type,
        exact_type: 1,
        limit: 100,
      },
    }).then((response) => response.data)
  )))
  return batches.flat().sort((a, b) => new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime())
}
