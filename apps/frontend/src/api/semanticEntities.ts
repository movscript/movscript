import { api } from '@/lib/api'

export type SemanticEntityKind =
  | 'scriptVersions'
  | 'segments'
  | 'productionTextBlocks'
  | 'sceneMoments'
  | 'productions'
  | 'storyboardScripts'
  | 'storyboardVersions'
  | 'storyboardLines'
  | 'contentUnits'
  | 'keyframes'
  | 'previewTimelines'
  | 'previewTimelineItems'
  | 'creativeReferences'
  | 'creativeReferenceStates'
  | 'creativeReferenceUsages'
  | 'creativeRelationships'
  | 'assetSlots'
  | 'assetSlotCandidates'
  | 'candidateDecisions'
  | 'reviewEvents'
  | 'workItems'
  | 'workReviews'
  | 'workDependencies'
  | 'deliveryVersions'
  | 'deliveryTimelineItems'
  | 'exportRecords'
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

export interface SemanticEntityConfig {
  kind: SemanticEntityKind
  path: string
  label: string
  pluralLabel: string
  description: string
  requiredHint?: string
  iconTone: string
  fields: SemanticEntityField[]
  summaryKeys: string[]
}

export type SemanticEntityPayload = Record<string, string | number | boolean | null>

export interface EntityRelation {
  ID: number
  CreatedAt?: string
  UpdatedAt?: string
  project_id: number
  source_type: string
  source_id: number
  target_type: string
  target_id: number
  category: string
  type: string
  label?: string
  scope_type?: string
  scope_id?: number | null
  direction: string
  order: number
  weight: number
  status: string
  source: string
  evidence?: string
  metadata_json?: string
  created_by_id?: number | null
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

export const semanticEntityConfigs: SemanticEntityConfig[] = semanticCoreEntityConfigs()

export function semanticEntityConfig(kind: SemanticEntityKind) {
  return semanticEntityConfigs.find((config) => config.kind === kind) ?? semanticEntityConfigs[0]
}

export function semanticEntityPath(projectId: number, config: SemanticEntityConfig) {
  return `/projects/${projectId}/entities/${config.path}`
}

export async function listSemanticEntities(projectId: number, config: SemanticEntityConfig) {
  const { data } = await api.get<SemanticEntityRecord[] | { items?: SemanticEntityRecord[] }>(semanticEntityPath(projectId, config))
  return Array.isArray(data) ? data : data.items ?? []
}

export async function listEntityRelations(projectId: number, filters: EntityRelationFilters = {}) {
  const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined && value !== null && value !== ''))
  const { data } = await api.get<EntityRelation[]>(`/projects/${projectId}/entities/relations`, { params })
  return data
}

export async function createSemanticEntity(projectId: number, config: SemanticEntityConfig, payload: SemanticEntityPayload) {
  const { data } = await api.post<SemanticEntityRecord>(semanticEntityPath(projectId, config), payload)
  return data
}

export async function updateSemanticEntity(projectId: number, config: SemanticEntityConfig, id: number, payload: SemanticEntityPayload) {
  const { data } = await api.patch<SemanticEntityRecord>(`${semanticEntityPath(projectId, config)}/${id}`, payload)
  return data
}

export async function deleteSemanticEntity(projectId: number, config: SemanticEntityConfig, id: number) {
  await api.delete(`${semanticEntityPath(projectId, config)}/${id}`)
}

function semanticCoreEntityConfigs(): SemanticEntityConfig[] {
  return [
    cfg('scriptVersions', 'script-versions', '剧本版本', '导入剧本、brief 或修订文本后的稳定版本，是片段和预演的源头。', 'text-sky-600', ['title', 'source_type', 'status', 'summary'], [
      num('script_id', 'Script ID', true, true, '关联旧 Script 记录'),
      text('title', '标题', true),
      select('source_type', '来源类型', ['raw', 'adapted', 'revised', 'ai']),
      area('content', '正文'),
      area('raw_source', '原文'),
      area('summary', '摘要'),
      select('status', '状态', ['draft', 'active', 'archived']),
    ], '需要先在旧版剧本页创建 Script，创建版本时填写 script_id。'),
    cfg('segments', 'segments', '片段', '制作里的内容片段，可选绑定制作文本块作为来源。', 'text-cyan-600', ['title', 'kind', 'status', 'summary'], [
      num('production_id', 'Production ID'),
      num('text_block_id', '文本块 ID'),
      text('title', '标题', true),
      selectOptions('kind', '类型', [
        { value: 'section', label: '片段' },
        { value: 'scene', label: '场次' },
        { value: 'montage', label: '蒙太奇' },
        { value: 'narration', label: '旁白' },
        { value: 'product_showcase', label: '产品展示' },
        { value: 'title_card', label: '标题卡' },
        { value: 'transition', label: '转场' },
      ]),
      num('order', '顺序'),
      area('summary', '摘要'),
      area('content', '内容'),
      select('status', '状态', ['draft', 'confirmed', 'ignored']),
      area('metadata_json', '元数据 JSON'),
    ]),
    cfg('productionTextBlocks', 'production-text-blocks', '制作文本块', '制作下面的源文本颗粒，片段可以绑定到这里而不是直接绑定剧本。', 'text-amber-600', ['title', 'kind', 'status', 'summary'], [
      num('production_id', 'Production ID', true, true),
      num('parent_block_id', '父文本块 ID'),
      selectOptions('kind', '类型', [
        { value: 'section', label: '段落' },
        { value: 'scene', label: '场次' },
        { value: 'beat', label: '节拍' },
        { value: 'dialogue', label: '对白' },
        { value: 'narration', label: '旁白' },
        { value: 'note', label: '备注' },
      ]),
      num('order', '顺序'),
      text('title', '标题'),
      area('content', '文本内容'),
      area('summary', '摘要'),
      select('source_type', '来源类型', ['manual', 'script', 'brief', 'ai', 'import']),
      select('status', '状态', ['draft', 'active', 'archived']),
      area('metadata_json', '元数据 JSON'),
    ], '创建时需要填写 production_id。'),
    cfg('sceneMoments', 'scene-moments', '情节', 'AI 生成的核心上下文：何时、何地、什么条件下发生什么。', 'text-teal-600', ['title', 'time_text', 'location_text', 'status'], [
      num('segment_id', 'Segment ID'),
      text('title', '标题', true),
      num('order', '顺序'),
      area('description', '描述'),
      text('time_text', '时间'),
      text('location_text', '地点'),
      area('condition_text', '条件'),
      area('action_text', '动作'),
      text('mood', '情绪'),
      selectOptions('status', '状态', [
        { value: 'draft', label: '草稿' },
        { value: 'confirmed', label: '已确认' },
        { value: 'ignored', label: '已忽略' },
      ]),
      area('metadata_json', '元数据 JSON'),
    ]),
    cfg('productions', 'productions', '制作', '一次完整制作主体，可从剧本、brief、预演创建，也可以直接裸创建。', 'text-orange-600', ['name', 'source_type', 'status', 'description'], [
      text('name', '制作名称', true),
      area('description', '制作说明'),
      select('source_type', '来源类型', ['direct', 'script', 'brief', 'preview', 'import']),
      select('status', '状态', ['planning', 'previewing', 'materializing', 'producing', 'reviewing', 'delivered', 'archived']),
      text('owner_label', '负责人'),
      num('progress', '进度'),
      num('script_version_id', 'ScriptVersion ID'),
      num('preview_timeline_id', 'PreviewTimeline ID'),
      area('metadata_json', '元数据 JSON'),
    ]),
    cfg('storyboardScripts', 'storyboard-scripts', '分镜脚本', '结构化分镜脚本，是情节到内容单元之间的正式语义对象。', 'text-blue-600', ['name', 'status', 'is_primary', 'description'], [
      num('script_version_id', 'ScriptVersion ID'),
      text('name', '名称', true),
      area('description', '描述'),
      bool('is_primary', '主分镜脚本'),
      select('status', '状态', ['draft', 'active', 'locked', 'archived']),
      area('metadata_json', '元数据 JSON'),
    ]),
    cfg('storyboardVersions', 'storyboard-versions', '分镜版本', '结构化分镜脚本的版本快照，用于比较 AI 候选和人工修改。', 'text-blue-600', ['title', 'version_number', 'source', 'status'], [
      num('storyboard_script_id', 'StoryboardScript ID', true, true),
      num('parent_version_id', 'ParentVersion ID'),
      num('version_number', '版本号', false, true),
      text('title', '标题'),
      select('source', '来源', ['manual', 'ai', 'import']),
      select('status', '状态', ['draft', 'active', 'archived']),
      area('snapshot_json', '快照 JSON'),
      area('metadata_json', '元数据 JSON'),
    ], '创建时需要填写 storyboard_script_id。'),
    cfg('storyboardLines', 'storyboard-lines', '分镜行', '结构化分镜脚本中的一行，可编译为一个或多个内容单元。', 'text-blue-600', ['title', 'kind', 'order', 'status'], [
      num('storyboard_script_id', 'StoryboardScript ID', true),
      num('storyboard_version_id', 'StoryboardVersion ID'),
      num('segment_id', 'Segment ID'),
      num('scene_moment_id', 'SceneMoment ID'),
      num('order', '顺序'),
      select('kind', '类型', ['beat', 'shot', 'caption', 'narration', 'transition', 'note']),
      text('title', '标题'),
      area('description', '描述'),
      area('dialogue', '对白'),
      area('visual_intent', '视觉意图'),
      num('duration_sec', '时长秒'),
      select('status', '状态', ['draft', 'candidate', 'confirmed', 'ignored']),
      area('metadata_json', '元数据 JSON'),
    ], '创建时需要填写 storyboard_script_id。'),
    cfg('contentUnits', 'content-units', '内容单元', '预演与生产的最小颗粒，镜头只是其中一种类型。', 'text-indigo-600', ['title', 'kind', 'duration_sec', 'status'], [
      num('production_id', 'Production ID'),
      num('segment_id', '所属片段 ID'),
      num('scene_moment_id', '所属情节 ID'),
      text('title', '标题', true),
      selectOptions('kind', '类型', [
        { value: 'shot', label: '镜头' },
        { value: 'visual_segment', label: '视觉段' },
        { value: 'product_showcase', label: '产品展示' },
        { value: 'caption_card', label: '字幕卡' },
        { value: 'narration', label: '旁白' },
        { value: 'transition', label: '转场' },
        { value: 'music_beat', label: '节拍' },
      ]),
      num('order', '顺序'),
      num('duration_sec', '时长秒'),
      area('description', '要做什么'),
      area('prompt', '生成提示'),
      selectOptions('shot_size', '景别', [
        { value: '', label: '未指定' },
        { value: 'extreme_wide', label: '大远景' },
        { value: 'wide', label: '远景' },
        { value: 'full', label: '全景' },
        { value: 'medium', label: '中景' },
        { value: 'medium_close', label: '中近景' },
        { value: 'close_up', label: '近景' },
        { value: 'extreme_close_up', label: '特写' },
        { value: 'detail', label: '细节' },
      ]),
      selectOptions('camera_angle', '机位角度', [
        { value: '', label: '未指定' },
        { value: 'eye_level', label: '平视' },
        { value: 'high_angle', label: '俯拍' },
        { value: 'low_angle', label: '仰拍' },
        { value: 'top_down', label: '顶拍' },
        { value: 'dutch_angle', label: '倾斜角' },
        { value: 'over_shoulder', label: '过肩' },
        { value: 'pov', label: '主观视角' },
      ]),
      selectOptions('camera_height', '镜头高度', [
        { value: '', label: '未指定' },
        { value: 'ground', label: '贴地' },
        { value: 'low', label: '低机位' },
        { value: 'eye', label: '视平线' },
        { value: 'high', label: '高机位' },
        { value: 'overhead', label: '俯视高位' },
      ]),
      selectOptions('camera_motion', '运镜方式', [
        { value: '', label: '未指定' },
        { value: 'static', label: '固定镜头' },
        { value: 'pan', label: '摇镜' },
        { value: 'tilt', label: '俯仰' },
        { value: 'dolly_in', label: '推进' },
        { value: 'dolly_out', label: '拉远' },
        { value: 'truck_left', label: '左移' },
        { value: 'truck_right', label: '右移' },
        { value: 'tracking', label: '跟拍' },
        { value: 'orbit', label: '环绕' },
        { value: 'crane', label: '升降' },
        { value: 'handheld', label: '手持' },
        { value: 'zoom', label: '变焦' },
      ]),
      selectOptions('motion_intensity', '运动强度', [
        { value: '', label: '未指定' },
        { value: 'subtle', label: '轻微' },
        { value: 'moderate', label: '适中' },
        { value: 'strong', label: '强烈' },
        { value: 'dynamic', label: '高动态' },
      ]),
      selectOptions('camera_speed', '运动速度', [
        { value: '', label: '未指定' },
        { value: 'slow', label: '慢' },
        { value: 'normal', label: '正常' },
        { value: 'fast', label: '快' },
        { value: 'ramp', label: '变速' },
      ]),
      text('lens', '镜头/镜片'),
      text('focal_length', '焦段'),
      text('focus_subject', '焦点主体'),
      area('composition_start', '起始构图'),
      area('composition_end', '结束构图'),
      selectOptions('stabilization', '稳定方式', [
        { value: '', label: '未指定' },
        { value: 'locked', label: '锁定稳定' },
        { value: 'smooth', label: '平滑稳定' },
        { value: 'handheld', label: '手持抖动' },
        { value: 'intentional_shake', label: '刻意晃动' },
      ]),
      area('camera_notes', '运镜备注'),
      area('camera_params_json', '相机参数 JSON'),
      selectOptions('status', '状态', [
        { value: 'draft', label: '草稿' },
        { value: 'candidate', label: '候选' },
        { value: 'confirmed', label: '已确认' },
        { value: 'in_production', label: '生产中' },
        { value: 'locked', label: '已锁定' },
      ]),
      area('metadata_json', '元数据 JSON'),
    ]),
    cfg('keyframes', 'keyframes', '关键帧', '情节或内容单元的视觉锚点，用于驱动预演时间线。', 'text-rose-600', ['title', 'status', 'description', 'prompt'], [
      num('production_id', 'Production ID'),
      num('scene_moment_id', 'SceneMoment ID'),
      num('content_unit_id', 'ContentUnit ID'),
      num('resource_id', 'Resource ID'),
      num('canvas_id', 'Canvas ID'),
      text('title', '标题', true),
      num('order', '顺序'),
      area('description', '描述'),
      area('prompt', '生成提示'),
      select('status', '状态', ['generated', 'candidate', 'attached', 'accepted', 'rejected']),
      area('metadata_json', '元数据 JSON'),
    ]),
    cfg('previewTimelines', 'preview-timelines', '预演时间线', '按内容单元排列的可播放预演版本。', 'text-emerald-600', ['name', 'status', 'duration_sec', 'is_primary'], [
      num('production_id', 'Production ID'),
      num('script_version_id', 'ScriptVersion ID'),
      text('name', '名称', true),
      num('duration_sec', '总时长秒'),
      bool('is_primary', '主时间线'),
      select('status', '状态', ['draft', 'playable', 'confirmed', 'archived']),
      area('metadata_json', '元数据 JSON'),
    ]),
    cfg('previewTimelineItems', 'preview-timeline-items', '预演时间线项', '预演时间线上的关键帧、内容单元、缺口或备注项。', 'text-emerald-600', ['label', 'kind', 'order', 'status'], timelineFields('preview_timeline_id', 'PreviewTimeline ID'), '创建时需要填写 preview_timeline_id。'),
    cfg('creativeReferences', 'creative-references', '创作资料', '人物、地点、道具、产品、风格和规则等项目资料。', 'text-violet-600', ['name', 'kind', 'importance', 'status'], [
      selectOptions('kind', '类型', [
        { value: 'person', label: '人物' },
        { value: 'place', label: '地点' },
        { value: 'prop', label: '道具' },
        { value: 'product', label: '产品' },
        { value: 'brand', label: '品牌' },
        { value: 'style', label: '风格' },
        { value: 'world_rule', label: '世界规则' },
        { value: 'time_period', label: '时间段' },
        { value: 'restriction', label: '限制' },
      ], true),
      text('name', '名称', true),
      text('alias', '别名'),
      area('description', '描述'),
      area('content', '资料内容'),
      selectOptions('importance', '重要性', [
        { value: 'main', label: '主要' },
        { value: 'supporting', label: '辅助' },
        { value: 'background', label: '背景' },
      ]),
      select('status', '状态', ['draft', 'confirmed', 'merged', 'ignored', 'locked']),
      area('profile_json', '档案 JSON'),
      area('tags_json', '标签 JSON'),
    ]),
    cfg('creativeReferenceStates', 'creative-reference-states', '资料状态', '创作资料在特定片段、情节或内容单元中的临时状态。', 'text-fuchsia-600', ['name', 'scope_type', 'status', 'emotion'], [
      num('creative_reference_id', 'CreativeReference ID', true),
      select('scope_type', '作用范围', ['script', 'segment', 'scene_moment', 'storyboard_line', 'content_unit', 'time_period'], true),
      num('scope_id', 'Scope ID'),
      text('name', '名称', true),
      area('description', '描述'),
      area('visual_notes', '视觉说明'),
      text('emotion', '情绪'),
      text('costume', '服装'),
      area('props', '道具'),
      select('status', '状态', ['draft', 'confirmed', 'locked', 'ignored']),
      area('tags_json', '标签 JSON'),
      area('metadata_json', '元数据 JSON'),
    ], '创建时需要填写 creative_reference_id。'),
    cfg('creativeReferenceUsages', 'creative-reference-usages', '资料使用', '记录结构对象使用哪一个创作资料及其状态。', 'text-fuchsia-600', ['owner_type', 'owner_id', 'role', 'status'], [
      select('owner_type', '归属类型', ['segment', 'scene_moment', 'storyboard_line', 'content_unit', 'keyframe'], true),
      num('owner_id', 'Owner ID', true),
      num('creative_reference_id', 'CreativeReference ID', true),
      num('creative_reference_state_id', 'CreativeReferenceState ID'),
      select('role', '角色', ['protagonist', 'supporting', 'location', 'prop', 'style', 'brand', 'rule']),
      num('order', '顺序'),
      area('evidence', '证据'),
      select('source', '来源', ['manual', 'ai', 'import']),
      select('status', '状态', ['draft', 'confirmed', 'corrected', 'ignored']),
      area('metadata_json', '元数据 JSON'),
    ], '创建时需要填写 owner_type、owner_id 和 creative_reference_id。'),
    cfg('creativeRelationships', 'creative-relationships', '资料关系', '创作资料之间的关系、约束、引用和冲突。', 'text-fuchsia-600', ['label', 'category', 'type', 'status'], [
      num('source_creative_reference_id', 'SourceCreativeReference ID', true),
      num('target_creative_reference_id', 'TargetCreativeReference ID', true),
      select('scope_type', '作用范围', ['project', 'script', 'segment', 'scene_moment', 'storyboard_line', 'content_unit']),
      num('scope_id', 'Scope ID'),
      select('category', '分类', ['relationship', 'continuity', 'conflict', 'constraint']),
      text('type', '类型'),
      text('label', '标签'),
      area('description', '描述'),
      select('source', '来源', ['manual', 'ai', 'import']),
      select('status', '状态', ['draft', 'confirmed', 'corrected', 'ignored']),
      area('evidence', '证据'),
      area('metadata_json', '元数据 JSON'),
    ], '创建时需要填写 source_creative_reference_id 和 target_creative_reference_id。'),
    cfg('assetSlots', 'asset-slots', '素材位', '正式生产前需要补齐、候选或锁定的素材缺口。', 'text-amber-600', ['name', 'kind', 'priority', 'status'], [
      num('production_id', 'Production ID'),
      select('owner_type', '归属类型', ['segment', 'scene_moment', 'storyboard_line', 'content_unit', 'keyframe', 'creative_reference_state']),
      num('owner_id', '归属对象 ID'),
      num('creative_reference_id', '创作资料'),
      num('creative_reference_state_id', '资料状态'),
      selectOptions('kind', '素材类型', [
        { value: 'image', label: '图片' },
        { value: 'video', label: '视频' },
        { value: 'audio', label: '音频' },
        { value: 'text', label: '文本' },
        { value: 'brand_pack', label: '品牌包' },
        { value: 'reference', label: '参考资料' },
      ]),
      text('name', '需要什么素材', true),
      text('slot_key', '素材位键'),
      area('description', '用途说明'),
      area('prompt_hint', '生成提示'),
      selectOptions('priority', '优先级', [
        { value: 'low', label: '低' },
        { value: 'normal', label: '普通' },
        { value: 'high', label: '高' },
        { value: 'critical', label: '紧急' },
      ]),
      num('resource_id', 'Resource ID'),
      num('locked_asset_slot_id', '已锁定素材位 ID'),
      select('status', '状态', ['missing', 'candidate', 'locked', 'waived']),
      area('metadata_json', '元数据 JSON'),
    ]),
    cfg('assetSlotCandidates', 'asset-slot-candidates', '素材候选', '某个素材位下的候选素材及选择状态。', 'text-amber-600', ['asset_slot_id', 'candidate_asset_slot_id', 'score', 'status'], [
      num('asset_slot_id', 'AssetSlot ID', true),
      num('candidate_asset_slot_id', 'Candidate AssetSlot ID', true),
      select('source_type', '来源类型', ['manual', 'upload', 'job', 'canvas', 'import']),
      num('source_id', 'Source ID'),
      num('score', '评分'),
      select('status', '状态', ['candidate', 'selected', 'rejected']),
      area('note', '备注'),
    ], '创建时需要填写 asset_slot_id 和 candidate_asset_slot_id。'),
    cfg('candidateDecisions', 'candidate-decisions', '候选决策', '记录候选的采纳、拒绝、修改、延后或回滚决策。', 'text-amber-600', ['candidate_type', 'decision', 'status', 'source'], [
      select('candidate_type', '候选类型', ['segment', 'scene_moment', 'storyboard_line', 'content_unit', 'keyframe', 'asset_slot_candidate', 'preview_timeline'], true),
      num('candidate_id', 'Candidate ID'),
      text('candidate_client_id', 'Candidate Client ID'),
      select('target_type', '目标类型', ['segment', 'scene_moment', 'storyboard_line', 'content_unit', 'keyframe', 'asset_slot', 'preview_timeline', 'delivery_version']),
      num('target_id', 'Target ID'),
      select('decision', '决策', ['accept', 'reject', 'revise', 'defer', 'rollback'], true),
      select('status', '状态', ['recorded', 'applied', 'superseded', 'failed']),
      area('reason', '原因'),
      area('note', '备注'),
      select('source', '来源', ['manual', 'ai', 'runtime', 'import']),
      num('decided_by_id', 'DecidedBy ID'),
      text('applied_at', 'Applied At'),
      area('metadata_json', '元数据 JSON'),
    ], '可用 candidate_id 关联已落库候选，也可用 candidate_client_id 记录草稿或 runtime 候选。'),
    cfg('reviewEvents', 'review-events', '评审事件', '记录语义对象、候选和输出的评审事件流。', 'text-orange-600', ['subject_type', 'event_type', 'from_status', 'to_status'], [
      select('subject_type', '对象类型', ['segment', 'scene_moment', 'storyboard_line', 'content_unit', 'keyframe', 'asset_slot', 'asset_slot_candidate', 'candidate_decision', 'work_item', 'delivery_version', 'canvas_output'], true),
      num('subject_id', 'Subject ID'),
      text('subject_client_id', 'Subject Client ID'),
      select('event_type', '事件类型', ['submitted', 'commented', 'approved', 'changes_requested', 'rejected', 'resolved', 'reopened', 'applied', 'rolled_back'], true),
      text('from_status', '原状态'),
      text('to_status', '新状态'),
      area('comment', '评论'),
      area('reason', '原因'),
      select('source', '来源', ['manual', 'ai', 'runtime', 'import']),
      num('actor_id', 'Actor ID'),
      area('metadata_json', '元数据 JSON'),
    ], '可用 subject_id 关联已落库对象，也可用 subject_client_id 记录草稿或 runtime 对象。'),
    cfg('workItems', 'work-items', '制作任务', '执行、分配、审核和返工状态，不作为内容事实源。', 'text-orange-600', ['title', 'target_type', 'kind', 'status'], [
      num('production_id', 'Production ID'),
      select('target_type', '目标类型', ['segment', 'scene_moment', 'storyboard_line', 'content_unit', 'creative_reference', 'creative_reference_state', 'asset_slot', 'keyframe', 'delivery_version'], true),
      num('target_id', 'Target ID', true),
      text('title', '标题', true),
      select('kind', '任务类型', ['human', 'ai', 'hybrid', 'review', 'fix']),
      area('description', '描述'),
      select('priority', '优先级', ['low', 'normal', 'high', 'critical']),
      select('status', '状态', ['todo', 'running', 'blocked', 'review', 'done', 'cancelled']),
      num('assignee_id', 'Assignee ID'),
      num('source_job_id', 'SourceJob ID'),
      num('source_canvas_id', 'SourceCanvas ID'),
      area('metadata_json', '元数据 JSON'),
    ]),
    cfg('workReviews', 'work-reviews', '任务审核', '制作任务的审核、修改意见和拒绝记录。', 'text-orange-600', ['work_item_id', 'status', 'comment'], [
      num('work_item_id', 'WorkItem ID', true),
      num('reviewer_id', 'Reviewer ID'),
      select('status', '状态', ['pending', 'approved', 'changes_requested', 'rejected']),
      area('comment', '意见'),
      area('metadata_json', '元数据 JSON'),
    ], '创建时需要填写 work_item_id。'),
    cfg('workDependencies', 'work-dependencies', '任务依赖', '制作任务之间的阻塞和顺序依赖。', 'text-orange-600', ['work_item_id', 'depends_on_work_item_id', 'dependency_type'], [
      num('work_item_id', 'WorkItem ID', true),
      num('depends_on_work_item_id', 'DependsOnWorkItem ID', true),
      select('dependency_type', '依赖类型', ['blocks', 'requires', 'relates_to']),
    ], '创建时需要填写 work_item_id 和 depends_on_work_item_id。'),
    cfg('deliveryVersions', 'delivery-versions', '交付版本', '成片检查、审核和导出版本记录。', 'text-lime-600', ['name', 'status', 'duration_sec', 'is_primary'], [
      num('production_id', 'Production ID'),
      num('preview_timeline_id', 'PreviewTimeline ID'),
      text('name', '名称', true),
      area('description', '描述'),
      num('duration_sec', '总时长秒'),
      bool('is_primary', '主版本'),
      select('status', '状态', ['draft', 'checking', 'approved', 'exported', 'archived']),
      area('metadata_json', '元数据 JSON'),
    ]),
    cfg('deliveryTimelineItems', 'delivery-timeline-items', '交付时间线项', '交付版本中的视频、图片、音频、字幕或缺口项。', 'text-lime-600', ['label', 'kind', 'order', 'status'], timelineFields('delivery_version_id', 'DeliveryVersion ID'), '创建时需要填写 delivery_version_id。'),
    cfg('exportRecords', 'export-records', '导出记录', '交付版本的导出任务、格式、预设和失败信息。', 'text-lime-600', ['delivery_version_id', 'format', 'preset', 'status'], [
      num('delivery_version_id', 'DeliveryVersion ID', true),
      num('resource_id', 'Resource ID'),
      select('status', '状态', ['pending', 'running', 'succeeded', 'failed']),
      text('format', '格式'),
      text('preset', '预设'),
      area('error', '错误'),
      area('metadata_json', '元数据 JSON'),
    ], '创建时需要填写 delivery_version_id。'),
    cfg('canvasOutputs', 'canvas-outputs', '画布输出', '画布运行结果写回语义实体或当前实体的明确落点。', 'text-purple-600', ['owner_type', 'owner_id', 'output_type', 'status'], [
      num('canvas_id', 'Canvas ID', true),
      num('canvas_run_id', 'CanvasRun ID'),
      text('canvas_node_id', 'Canvas Node ID'),
      text('port_id', 'Port ID', true),
      select('owner_type', '归属类型', ['script_version', 'segment', 'scene_moment', 'storyboard_script', 'storyboard_line', 'content_unit', 'keyframe', 'asset_slot', 'delivery_version'], true),
      num('owner_id', 'Owner ID', true),
      select('output_type', '输出类型', ['resource', 'field', 'candidate', 'note']),
      num('resource_id', 'Resource ID'),
      text('target_field', '目标字段'),
      area('value_json', '值 JSON'),
      select('status', '状态', ['pending', 'attached', 'applied', 'rejected']),
      area('metadata_json', '元数据 JSON'),
    ], '创建时需要填写 canvas_id、port_id、owner_type 和 owner_id。'),
  ]
}

function cfg(
  kind: SemanticEntityKind,
  path: string,
  label: string,
  description: string,
  iconTone: string,
  summaryKeys: string[],
  fields: SemanticEntityField[],
  requiredHint?: string,
): SemanticEntityConfig {
  return { kind, path, label, pluralLabel: label, description, iconTone, summaryKeys, fields, requiredHint }
}

function text(key: string, label: string, required = false): SemanticEntityField {
  return { key, label, type: 'text', required }
}

function area(key: string, label: string): SemanticEntityField {
  return { key, label, type: 'textarea' }
}

function num(key: string, label: string, required = false, createOnly = false, helper?: string): SemanticEntityField {
  return { key, label, type: 'number', required, createOnly, helper }
}

function bool(key: string, label: string): SemanticEntityField {
  return { key, label, type: 'boolean' }
}

function select(key: string, label: string, values: string[], required = false): SemanticEntityField {
  return { key, label, type: 'select', required, options: options(values) }
}

function selectOptions(key: string, label: string, options: SemanticEntityOption[], required = false): SemanticEntityField {
  return { key, label, type: 'select', required, options }
}

function timelineFields(ownerKey: string, ownerLabel: string): SemanticEntityField[] {
  return [
    num(ownerKey, ownerLabel, true),
    num('content_unit_id', 'ContentUnit ID'),
    num('asset_slot_id', 'AssetSlot ID'),
    num('resource_id', 'Resource ID'),
    num('segment_id', 'Segment ID'),
    num('scene_moment_id', 'SceneMoment ID'),
    num('keyframe_id', 'Keyframe ID'),
    select('kind', '类型', ['keyframe', 'content_unit', 'video', 'image', 'audio', 'caption', 'gap', 'note']),
    num('order', '顺序'),
    num('start_sec', '开始秒'),
    num('duration_sec', '时长秒'),
    text('label', '标签'),
    select('status', '状态', ['draft', 'confirmed', 'needs_asset', 'missing', 'locked', 'approved']),
    area('metadata_json', '元数据 JSON'),
  ]
}

function options(values: string[]): SemanticEntityOption[] {
  return values.map((value) => ({ value, label: value }))
}
