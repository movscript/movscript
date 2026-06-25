import type { Project } from './surfaceTypes.js'

export type SurfaceSemanticEntityKind = string
export type SemanticEntityPayload = Record<string, string | number | boolean | null>
export type SemanticEntityListParams = Record<string, string | number | boolean | null | undefined>
export type SemanticEntityRecord = Record<string, unknown> & {
  ID?: number
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

export interface SemanticEntityConfig {
  kind: string
  path: string
  label: string
  pluralLabel: string
  description: string
  summaryKeys: string[]
}

export interface SurfaceSemanticEntityClient {
  getProject?(projectId: number): Promise<Project>
  listSemanticEntities(
    projectId: number,
    config: SemanticEntityConfig,
    params?: SemanticEntityListParams,
  ): Promise<SemanticEntityRecord[]>
  createSemanticEntity(
    projectId: number,
    config: SemanticEntityConfig,
    payload: SemanticEntityPayload,
  ): Promise<SemanticEntityRecord>
}

let semanticEntityClient: SurfaceSemanticEntityClient | undefined

export function configureSurfaceSemanticEntityClient(client: SurfaceSemanticEntityClient): void {
  semanticEntityClient = client
}

export function readSurfaceSemanticEntityClient(): SurfaceSemanticEntityClient {
  if (!semanticEntityClient) throw new Error('Surface semantic entity client is not configured.')
  return semanticEntityClient
}

export const semanticEntityConfigs: SemanticEntityConfig[] = [
  cfg('scriptVersions', 'script-versions', '手记版本', '导入手记、brief 或修订文本后的稳定版本。', ['title', 'source_type']),
  cfg('scriptBlocks', 'script-blocks', '手记块', '绑定到手记版本的可引用文本块。', ['kind', 'speaker', 'content']),
  cfg('segments', 'segments', '段落', '制作结构中的叙事段落。', ['title', 'order']),
  cfg('productionTextBlocks', 'production-text-blocks', '制作文本块', '制作阶段使用的文本片段。', ['kind', 'content']),
  cfg('sceneMoments', 'scene-moments', '情节', '段落下的具体情节。', ['title', 'scene_code']),
  cfg('expressionUnits', 'expression-units', '表达单元', '情节下逐条编辑的对白、动作、旁白、屏幕文字和镜头描述。', ['kind', 'speaker', 'text']),
  cfg('productions', 'productions', '制作', '项目中的制作单元。', ['name']),
  cfg('storyboardScripts', 'storyboard-scripts', '分镜脚本', '分镜脚本。', ['title']),
  cfg('storyboardVersions', 'storyboard-versions', '分镜版本', '分镜版本。', ['title']),
  cfg('contentUnits', 'content-units', '创作片段', '可生产的创作片段。', ['title', 'kind']),
  cfg('keyframes', 'keyframes', '关键帧', '创作片段或情节下的关键画面。', ['title']),
  cfg('previewTimelines', 'preview-timelines', '预览时间线', '预览时间线。', ['title']),
  cfg('previewTimelineItems', 'preview-timeline-items', '预览时间线项', '预览时间线项。', ['owner_type', 'owner_id']),
  cfg('settings', 'settings', '设定', '旧兼容名称；新 workspace ontology 中统一为 setting。', ['name', 'kind']),
  cfg('settingStates', 'setting-states', '设定状态', '旧兼容名称；新 workspace ontology 中统一为 setting_state。', ['name']),
  cfg('settingUsages', 'setting-usages', '设定引用', '结构对象对设定的引用。', ['owner_type', 'owner_id', 'role']),
  cfg('creativeRelationships', 'creative-relationships', '设定关系', '设定之间的关系。', ['type']),
  cfg('assetSlots', 'asset-slots', '素材需求', '需要生成或绑定的素材需求。', ['name', 'kind']),
  cfg('assetSlotCandidates', 'asset-slot-candidates', '素材候选', '素材需求的候选结果。', ['name', 'resource_id']),
  cfg('candidateDecisions', 'candidate-decisions', '候选决策', '候选素材的决策记录。', ['status']),
  cfg('reviewEvents', 'review-events', '审阅事件', '审阅事件。', ['status']),
  cfg('canvasOutputs', 'canvas-outputs', '画布输出', '画布输出。', ['status']),
]

export function semanticEntityConfig(kind: string): SemanticEntityConfig {
  return semanticEntityConfigs.find((config) => config.kind === kind) ?? semanticEntityConfigs[0]!
}

export function listSurfaceSemanticEntities(
  projectId: number,
  config: SemanticEntityConfig,
  params: SemanticEntityListParams = {},
): Promise<SemanticEntityRecord[]> {
  return readSurfaceSemanticEntityClient().listSemanticEntities(projectId, config, params)
}

export function createSurfaceSemanticEntity(
  projectId: number,
  config: SemanticEntityConfig,
  payload: SemanticEntityPayload,
): Promise<SemanticEntityRecord> {
  return readSurfaceSemanticEntityClient().createSemanticEntity(projectId, config, payload)
}

export function getSurfaceProject(projectId: number): Promise<Project> {
  const getProject = readSurfaceSemanticEntityClient().getProject
  if (!getProject) throw new Error('Surface semantic project reader is not configured.')
  return getProject(projectId)
}

function cfg(
  kind: string,
  path: string,
  label: string,
  description: string,
  summaryKeys: string[],
): SemanticEntityConfig {
  return {
    kind,
    path,
    label,
    pluralLabel: label,
    description,
    summaryKeys,
  }
}
