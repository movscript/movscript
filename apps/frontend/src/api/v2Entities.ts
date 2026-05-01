import { api } from '@/lib/api'

export type V2EntityKind =
  | 'scriptVersions'
  | 'scriptSections'
  | 'situations'
  | 'contentUnits'
  | 'keyframes'
  | 'previewTimelines'
  | 'creativeReferences'
  | 'creativeReferenceStates'
  | 'assetRequirements'
  | 'workItems'
  | 'deliveryVersions'

export type V2EntityRecord = Record<string, unknown> & {
  ID: number
  CreatedAt?: string
  UpdatedAt?: string
  project_id?: number
  title?: string
  name?: string
  status?: string
  kind?: string
  order?: number
}

export interface V2EntityOption {
  value: string
  label: string
}

export interface V2EntityField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'boolean'
  required?: boolean
  placeholder?: string
  options?: V2EntityOption[]
  createOnly?: boolean
  helper?: string
}

export interface V2EntityConfig {
  kind: V2EntityKind
  path: string
  label: string
  pluralLabel: string
  description: string
  requiredHint?: string
  iconTone: string
  fields: V2EntityField[]
  summaryKeys: string[]
}

export type V2EntityPayload = Record<string, string | number | boolean | null>

export const v2EntityConfigs: V2EntityConfig[] = [
  {
    kind: 'scriptVersions',
    path: 'script-versions',
    label: '剧本版本',
    pluralLabel: '剧本版本',
    description: '导入剧本、brief 或修订文本后的稳定版本，是剧本节和预演的源头。',
    requiredHint: '需要先在旧版剧本页创建 Script，创建版本时填写 script_id。',
    iconTone: 'text-sky-600',
    summaryKeys: ['title', 'source_type', 'status', 'summary'],
    fields: [
      { key: 'script_id', label: 'Script ID', type: 'number', required: true, createOnly: true, helper: '关联旧 Script 记录' },
      { key: 'title', label: '标题', type: 'text', required: true },
      { key: 'source_type', label: '来源类型', type: 'select', options: options(['raw', 'adapted', 'revised', 'ai']) },
      { key: 'content', label: '正文', type: 'textarea' },
      { key: 'raw_source', label: '原文', type: 'textarea' },
      { key: 'summary', label: '摘要', type: 'textarea' },
      { key: 'status', label: '状态', type: 'select', options: options(['draft', 'active', 'archived']) },
    ],
  },
  {
    kind: 'scriptSections',
    path: 'script-sections',
    label: '剧本节',
    pluralLabel: '剧本节',
    description: '从剧本版本切出的语义段落，不等同于传统场景。',
    requiredHint: '创建时需要填写 script_version_id。',
    iconTone: 'text-cyan-600',
    summaryKeys: ['title', 'kind', 'status', 'summary'],
    fields: [
      { key: 'script_version_id', label: 'ScriptVersion ID', type: 'number', required: true, createOnly: true },
      { key: 'title', label: '标题', type: 'text', required: true },
      { key: 'kind', label: '类型', type: 'select', options: options(['section', 'scene', 'montage', 'narration', 'product_showcase', 'title_card', 'transition']) },
      { key: 'order', label: '顺序', type: 'number' },
      { key: 'summary', label: '摘要', type: 'textarea' },
      { key: 'content', label: '内容', type: 'textarea' },
      { key: 'source_range', label: '原文范围', type: 'text' },
      { key: 'status', label: '状态', type: 'select', options: options(['draft', 'confirmed', 'ignored']) },
    ],
  },
  {
    kind: 'situations',
    path: 'situations',
    label: '情境',
    pluralLabel: '情境',
    description: 'AI 生成的核心上下文：何时、何地、什么条件下发生什么。',
    iconTone: 'text-teal-600',
    summaryKeys: ['title', 'time_text', 'location_text', 'status'],
    fields: [
      { key: 'script_section_id', label: 'ScriptSection ID', type: 'number' },
      { key: 'title', label: '标题', type: 'text', required: true },
      { key: 'order', label: '顺序', type: 'number' },
      { key: 'description', label: '描述', type: 'textarea' },
      { key: 'time_text', label: '时间', type: 'text' },
      { key: 'location_text', label: '地点', type: 'text' },
      { key: 'condition_text', label: '条件', type: 'textarea' },
      { key: 'action_text', label: '动作', type: 'textarea' },
      { key: 'mood', label: '情绪', type: 'text' },
      { key: 'status', label: '状态', type: 'select', options: options(['draft', 'confirmed', 'ignored']) },
    ],
  },
  {
    kind: 'contentUnits',
    path: 'content-units',
    label: '内容单元',
    pluralLabel: '内容单元',
    description: '预演与生产的最小颗粒，镜头只是其中一种类型。',
    iconTone: 'text-indigo-600',
    summaryKeys: ['title', 'kind', 'duration_sec', 'status'],
    fields: [
      { key: 'script_section_id', label: 'ScriptSection ID', type: 'number' },
      { key: 'situation_id', label: 'Situation ID', type: 'number' },
      { key: 'title', label: '标题', type: 'text', required: true },
      { key: 'kind', label: '类型', type: 'select', options: options(['shot', 'visual_segment', 'product_showcase', 'caption_card', 'narration', 'transition', 'music_beat']) },
      { key: 'order', label: '顺序', type: 'number' },
      { key: 'duration_sec', label: '时长秒', type: 'number' },
      { key: 'description', label: '描述', type: 'textarea' },
      { key: 'prompt', label: '生成提示', type: 'textarea' },
      { key: 'status', label: '状态', type: 'select', options: options(['draft', 'confirmed', 'in_production', 'locked']) },
    ],
  },
  {
    kind: 'keyframes',
    path: 'keyframes',
    label: '关键帧',
    pluralLabel: '关键帧',
    description: '情境或内容单元的视觉锚点，用于驱动预演时间线。',
    iconTone: 'text-rose-600',
    summaryKeys: ['title', 'status', 'description', 'prompt'],
    fields: [
      { key: 'situation_id', label: 'Situation ID', type: 'number' },
      { key: 'content_unit_id', label: 'ContentUnit ID', type: 'number' },
      { key: 'title', label: '标题', type: 'text', required: true },
      { key: 'order', label: '顺序', type: 'number' },
      { key: 'description', label: '描述', type: 'textarea' },
      { key: 'prompt', label: '生成提示', type: 'textarea' },
      { key: 'status', label: '状态', type: 'select', options: options(['generated', 'candidate', 'attached', 'accepted', 'rejected']) },
    ],
  },
  {
    kind: 'previewTimelines',
    path: 'preview-timelines',
    label: '预演时间线',
    pluralLabel: '预演时间线',
    description: '按内容单元排列的可播放预演版本。',
    iconTone: 'text-emerald-600',
    summaryKeys: ['name', 'status', 'duration_sec', 'is_primary'],
    fields: [
      { key: 'script_version_id', label: 'ScriptVersion ID', type: 'number' },
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'duration_sec', label: '总时长秒', type: 'number' },
      { key: 'is_primary', label: '主时间线', type: 'boolean' },
      { key: 'status', label: '状态', type: 'select', options: options(['draft', 'playable', 'confirmed', 'archived']) },
    ],
  },
  {
    kind: 'creativeReferences',
    path: 'creative-references',
    label: '创作资料',
    pluralLabel: '创作资料',
    description: '人物、地点、道具、产品、风格和规则等项目资料。',
    iconTone: 'text-violet-600',
    summaryKeys: ['name', 'kind', 'importance', 'status'],
    fields: [
      { key: 'kind', label: '类型', type: 'select', required: true, options: options(['person', 'animal', 'place', 'prop', 'product', 'brand', 'style', 'world_rule', 'time_period', 'restriction']) },
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'alias', label: '别名', type: 'text' },
      { key: 'description', label: '描述', type: 'textarea' },
      { key: 'content', label: '资料内容', type: 'textarea' },
      { key: 'importance', label: '重要性', type: 'select', options: options(['main', 'supporting', 'background']) },
      { key: 'status', label: '状态', type: 'select', options: options(['draft', 'confirmed', 'merged', 'ignored', 'locked']) },
      { key: 'tags_json', label: '标签 JSON', type: 'textarea' },
    ],
  },
  {
    kind: 'creativeReferenceStates',
    path: 'creative-reference-states',
    label: '资料状态',
    pluralLabel: '资料状态',
    description: '创作资料在特定剧本节、情境或内容单元中的临时状态。',
    requiredHint: '创建时需要填写 creative_reference_id。',
    iconTone: 'text-fuchsia-600',
    summaryKeys: ['name', 'scope_type', 'status', 'emotion'],
    fields: [
      { key: 'creative_reference_id', label: 'CreativeReference ID', type: 'number', required: true },
      { key: 'scope_type', label: '作用范围', type: 'select', required: true, options: options(['script', 'script_section', 'situation', 'content_unit', 'time_period']) },
      { key: 'scope_id', label: 'Scope ID', type: 'number' },
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'description', label: '描述', type: 'textarea' },
      { key: 'visual_notes', label: '视觉说明', type: 'textarea' },
      { key: 'emotion', label: '情绪', type: 'text' },
      { key: 'costume', label: '服装', type: 'text' },
      { key: 'props', label: '道具', type: 'textarea' },
      { key: 'status', label: '状态', type: 'select', options: options(['draft', 'confirmed', 'locked', 'ignored']) },
    ],
  },
  {
    kind: 'assetRequirements',
    path: 'asset-requirements',
    label: '素材需求',
    pluralLabel: '素材需求',
    description: '正式生产前需要补齐、候选或锁定的素材缺口。',
    iconTone: 'text-amber-600',
    summaryKeys: ['name', 'kind', 'priority', 'status'],
    fields: [
      { key: 'owner_type', label: '归属类型', type: 'select', options: options(['script_section', 'situation', 'content_unit', 'keyframe', 'creative_reference_state']) },
      { key: 'owner_id', label: 'Owner ID', type: 'number' },
      { key: 'kind', label: '素材类型', type: 'select', options: options(['image', 'video', 'audio', 'text', 'brand_pack', 'reference']) },
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'required_slot', label: '需求槽位', type: 'text' },
      { key: 'description', label: '描述', type: 'textarea' },
      { key: 'prompt_hint', label: '生成提示', type: 'textarea' },
      { key: 'priority', label: '优先级', type: 'select', options: options(['low', 'normal', 'high', 'critical']) },
      { key: 'status', label: '状态', type: 'select', options: options(['missing', 'candidate', 'locked', 'waived']) },
    ],
  },
  {
    kind: 'workItems',
    path: 'work-items',
    label: '制作任务',
    pluralLabel: '制作任务',
    description: '执行、分配、审核和返工状态，不作为内容事实源。',
    iconTone: 'text-orange-600',
    summaryKeys: ['title', 'target_type', 'kind', 'status'],
    fields: [
      { key: 'target_type', label: '目标类型', type: 'select', required: true, options: options(['script_section', 'situation', 'content_unit', 'creative_reference', 'creative_reference_state', 'asset_requirement', 'asset', 'keyframe', 'delivery_version']) },
      { key: 'target_id', label: 'Target ID', type: 'number', required: true },
      { key: 'title', label: '标题', type: 'text', required: true },
      { key: 'kind', label: '任务类型', type: 'select', options: options(['human', 'ai', 'hybrid', 'review', 'fix']) },
      { key: 'description', label: '描述', type: 'textarea' },
      { key: 'priority', label: '优先级', type: 'select', options: options(['low', 'normal', 'high', 'critical']) },
      { key: 'status', label: '状态', type: 'select', options: options(['todo', 'running', 'blocked', 'review', 'done', 'cancelled']) },
    ],
  },
  {
    kind: 'deliveryVersions',
    path: 'delivery-versions',
    label: '交付版本',
    pluralLabel: '交付版本',
    description: '成片检查、审核和导出版本记录。',
    iconTone: 'text-lime-600',
    summaryKeys: ['name', 'status', 'duration_sec', 'is_primary'],
    fields: [
      { key: 'preview_timeline_id', label: 'PreviewTimeline ID', type: 'number' },
      { key: 'name', label: '名称', type: 'text', required: true },
      { key: 'description', label: '描述', type: 'textarea' },
      { key: 'duration_sec', label: '总时长秒', type: 'number' },
      { key: 'is_primary', label: '主版本', type: 'boolean' },
      { key: 'status', label: '状态', type: 'select', options: options(['draft', 'checking', 'approved', 'exported', 'archived']) },
    ],
  },
]

export function v2EntityConfig(kind: V2EntityKind) {
  return v2EntityConfigs.find((config) => config.kind === kind) ?? v2EntityConfigs[0]
}

export async function listV2Entities(projectId: number, config: V2EntityConfig) {
  const { data } = await api.get<V2EntityRecord[]>(`/projects/${projectId}/v2/${config.path}`)
  return data
}

export async function createV2Entity(projectId: number, config: V2EntityConfig, payload: V2EntityPayload) {
  const { data } = await api.post<V2EntityRecord>(`/projects/${projectId}/v2/${config.path}`, payload)
  return data
}

export async function updateV2Entity(projectId: number, config: V2EntityConfig, id: number, payload: V2EntityPayload) {
  const { data } = await api.patch<V2EntityRecord>(`/projects/${projectId}/v2/${config.path}/${id}`, payload)
  return data
}

export async function deleteV2Entity(projectId: number, config: V2EntityConfig, id: number) {
  await api.delete(`/projects/${projectId}/v2/${config.path}/${id}`)
}

function options(values: string[]): V2EntityOption[] {
  return values.map((value) => ({ value, label: value }))
}
