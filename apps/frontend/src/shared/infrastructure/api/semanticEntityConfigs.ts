import type { SemanticEntityKind as MovScriptCoreSemanticEntityKind } from '@movscript/language/domain'
import type { SemanticEntityConfig, SemanticEntityField, SemanticEntityKind, SemanticEntityOption } from './semanticEntityTypes'

export const semanticEntityConfigs: SemanticEntityConfig[] = semanticCoreEntityConfigs()

export function semanticEntityConfig(kind: SemanticEntityKind): SemanticEntityConfig {
  return semanticEntityConfigs.find((config) => config.kind === kind) ?? semanticEntityConfigs[0]!
}

export function semanticEntityType(kind: SemanticEntityKind): MovScriptCoreSemanticEntityKind | undefined {
  return semanticEntityTypeByKind[kind]
}

export const semanticEntityTypeByKind: Partial<Record<SemanticEntityKind, MovScriptCoreSemanticEntityKind>> = {
  scriptVersions: 'script_version',
  scriptBlocks: 'script_block',
  segments: 'segment',
  sceneMoments: 'scene_moment',
  expressionUnits: 'expression_unit',
  productions: 'production',
  storyboardScripts: 'storyboard',
  storyboardVersions: 'storyboard',
  contentUnits: 'content_unit',
  keyframes: 'keyframe',
  settings: 'setting',
  settingStates: 'setting_state',
  assetSlots: 'asset',
}

function semanticCoreEntityConfigs(): SemanticEntityConfig[] {
  return [
    cfg('scriptVersions', 'script-versions', '剧本版本', '导入剧本、brief 或修订文本后的稳定版本。', ['title', 'source_type'], [
      num('script_id', 'Script ID', true, true),
      textCreateOnly('title', '标题', true),
      selectCreateOnly('source_type', '来源类型', ['raw', 'adapted', 'revised', 'ai']),
      areaCreateOnly('content', '正文'),
      areaCreateOnly('raw_source', '原文'),
      areaCreateOnly('summary', '摘要'),
    ]),
    cfg('scriptBlocks', 'script-blocks', '剧本块', '绑定到剧本版本的可引用文本块。', ['kind', 'speaker', 'content'], [
      num('script_id', 'Script ID', true, true),
      num('script_version_id', 'ScriptVersion ID', true, true),
      num('parent_block_id', '父剧本块 ID'),
      num('order', '顺序'),
      select('kind', '类型', ['scene_heading', 'action', 'dialogue', 'transition', 'note']),
      text('speaker', '说话人'),
      area('content', '内容'),
    ]),
    cfg('segments', 'segments', '段落', '制作结构中的叙事段落。', ['title', 'order'], [
      num('production_id', 'Production ID'),
      text('title', '标题', true),
      area('summary', '摘要'),
      num('order', '顺序'),
    ]),
    cfg('productionTextBlocks', 'production-text-blocks', '制作文本块', '制作阶段使用的文本片段。', ['kind', 'content'], [
      num('production_id', 'Production ID'),
      select('kind', '类型', ['brief', 'note', 'dialogue', 'action']),
      area('content', '内容'),
    ]),
    cfg('sceneMoments', 'scene-moments', '情节', '段落下的具体情节。', ['title', 'scene_code'], [
      num('production_id', 'Production ID'),
      num('segment_id', 'Segment ID'),
      text('scene_code', '场景编号'),
      text('title', '标题', true),
      text('time_text', '时间'),
      text('location_text', '地点'),
      area('action_text', '动作'),
      area('description', '描述'),
      num('order', '顺序'),
    ]),
    cfg('expressionUnits', 'expression-units', '表达单元', '情节下逐条编辑的对白、动作、旁白、屏幕文字和镜头描述。', ['kind', 'speaker', 'text'], [
      num('scene_moment_id', 'SceneMoment ID', true),
      selectOptions('kind', '类型', [
        { value: 'dialogue', label: '对白' },
        { value: 'action', label: '动作' },
        { value: 'narration', label: '旁白' },
        { value: 'subtitle', label: '屏幕文字' },
        { value: 'visual', label: '镜头描述' },
      ], true),
      text('speaker', '说话人'),
      area('text', '文本', true),
      area('note', '备注'),
      num('order', '顺序'),
    ]),
    cfg('productions', 'productions', '制作', '项目中的制作单元。', ['name'], [
      text('name', '名称', true),
      area('description', '描述'),
      num('script_version_id', 'ScriptVersion ID'),
    ]),
    cfg('storyboardScripts', 'storyboard-scripts', '分镜脚本', '分镜脚本。', ['title'], genericFields()),
    cfg('storyboardVersions', 'storyboard-versions', '分镜版本', '分镜版本。', ['title'], genericFields()),
    cfg('contentUnits', 'content-units', '制作项', '可生产的内容单元。', ['title', 'kind'], [
      num('production_id', 'Production ID'),
      num('scene_moment_id', 'SceneMoment ID'),
      text('unit_code', '制作项编号'),
      text('title', '标题', true),
      select('kind', '类型', ['shot', 'voiceover', 'dialogue_audio', 'sound', 'music_beat', 'subtitle', 'caption_card', 'transition'], true),
      area('description', '描述'),
      area('prompt', '提示词'),
      num('duration_sec', '时长'),
    ]),
    cfg('keyframes', 'keyframes', '关键帧', '制作项或情节下的关键画面。', ['title'], [
      num('production_id', 'Production ID'),
      num('scene_moment_id', 'SceneMoment ID'),
      num('content_unit_id', 'ContentUnit ID'),
      text('title', '标题', true),
      area('description', '描述'),
      area('prompt', '提示词'),
      num('order', '顺序'),
    ]),
    cfg('previewTimelines', 'preview-timelines', '预览时间线', '预览时间线。', ['title'], genericFields()),
    cfg('previewTimelineItems', 'preview-timeline-items', '预览时间线项', '预览时间线项。', ['owner_type', 'owner_id'], timelineFields('preview_timeline_id', 'PreviewTimeline ID')),
    cfg('settings', 'settings', '设定', '旧兼容名称；新 workspace ontology 中统一为 setting。', ['name', 'kind'], [
      text('name', '名称', true),
      select('kind', '类型', ['character', 'location', 'prop', 'world_rule', 'style_reference', 'organization']),
      area('description', '描述'),
      area('content', '内容'),
    ]),
    cfg('settingStates', 'setting-states', '设定状态', '旧兼容名称；新 workspace ontology 中统一为 setting_state。', ['name'], [
      num('setting_id', 'Setting ID', true),
      text('name', '名称'),
      text('scope_type', '范围类型'),
      num('scope_id', '范围 ID'),
      area('description', '描述'),
    ]),
    cfg('settingUsages', 'setting-usages', '设定引用', '结构对象对设定的引用。', ['owner_type', 'owner_id', 'role'], [
      text('owner_type', '归属类型', true),
      num('owner_id', '归属 ID', true),
      num('setting_id', '设定 ID', true),
      num('setting_state_id', '设定状态 ID'),
      text('role', '角色'),
    ]),
    cfg('creativeRelationships', 'creative-relationships', '设定关系', '设定之间的关系。', ['type'], [
      num('source_setting_id', 'SourceSetting ID', true),
      num('target_setting_id', 'TargetSetting ID', true),
      text('type', '类型'),
      text('label', '标签'),
    ]),
    cfg('assetSlots', 'asset-slots', '素材需求', '需要生成或绑定的素材需求。', ['name', 'kind'], [
      select('owner_type', '归属类型', ['setting', 'segment', 'scene_moment', 'content_unit', 'keyframe', 'setting_state']),
      num('owner_id', '归属 ID'),
      num('production_id', 'Production ID'),
      num('setting_id', '设定 ID'),
      num('setting_state_id', '设定状态 ID'),
      text('name', '名称', true),
      select('kind', '类型', ['image', 'video', 'audio', 'text'], true),
      area('description', '描述'),
      text('slot_key', 'Slot Key'),
      area('prompt_hint', '提示词线索'),
    ]),
    cfg('assetSlotCandidates', 'asset-slot-candidates', '素材候选', '素材需求的候选结果。', ['name', 'resource_id'], [
      num('asset_slot_id', 'AssetSlot ID', true),
      num('candidate_asset_slot_id', 'CandidateAssetSlot ID'),
      num('resource_id', 'Resource ID', false, true, '创建时可直接填资源 ID'),
      text('name', '名称'),
      area('description', '描述'),
    ], '创建时需要填写 asset_slot_id，并提供 candidate_asset_slot_id 或 resource_id；传入 resource_id 时会自动创建候选素材位。'),
    cfg('candidateDecisions', 'candidate-decisions', '候选决策', '候选素材的决策记录。', ['status'], genericFields()),
    cfg('reviewEvents', 'review-events', '审阅事件', '审阅事件。', ['status'], genericFields()),
    cfg('canvasOutputs', 'canvas-outputs', '画布输出', '画布输出。', ['status'], genericFields()),
  ]
}

function cfg(
  kind: SemanticEntityKind,
  path: string,
  label: string,
  description: string,
  summaryKeys: string[],
  fields: SemanticEntityField[],
  requiredHint?: string,
): SemanticEntityConfig {
  return {
    kind,
    path,
    label,
    pluralLabel: label,
    description,
    requiredHint,
    iconTone: 'blue',
    fields,
    summaryKeys,
  }
}

function genericFields(): SemanticEntityField[] {
  return [
    text('title', '标题'),
    text('name', '名称'),
    area('description', '描述'),
  ]
}

function timelineFields(ownerKey: string, ownerLabel: string): SemanticEntityField[] {
  return [
    num(ownerKey, ownerLabel),
    text('owner_type', '归属类型'),
    num('owner_id', '归属 ID'),
    num('start_sec', '开始时间'),
    num('duration_sec', '时长'),
  ]
}

function text(key: string, label: string, required = false): SemanticEntityField {
  return { key, label, type: 'text', required }
}

function textCreateOnly(key: string, label: string, required = false, helper?: string): SemanticEntityField {
  return { key, label, type: 'text', required, createOnly: true, helper }
}

function area(key: string, label: string, required = false): SemanticEntityField {
  return { key, label, type: 'textarea', required }
}

function areaCreateOnly(key: string, label: string, helper?: string): SemanticEntityField {
  return { key, label, type: 'textarea', createOnly: true, helper }
}

function num(key: string, label: string, required = false, createOnly = false, helper?: string): SemanticEntityField {
  return { key, label, type: 'number', required, createOnly, helper }
}

function select(key: string, label: string, values: string[], required = false, helper?: string): SemanticEntityField {
  return { key, label, type: 'select', options: values.map((value) => ({ value, label: value })), required, helper }
}

function selectCreateOnly(key: string, label: string, values: string[], required = false, helper?: string): SemanticEntityField {
  return { key, label, type: 'select', options: values.map((value) => ({ value, label: value })), required, createOnly: true, helper }
}

function selectOptions(key: string, label: string, options: SemanticEntityOption[], required = false): SemanticEntityField {
  return { key, label, type: 'select', options, required }
}
