import type { ShotLibraryFacetFilters, ShotLibrarySemanticCategory } from './shotReferenceLibrary'

export type ShotVocabularyCategory =
  | ShotLibrarySemanticCategory
  | 'visual'
  | 'narrative'
  | 'scene'
  | 'emotion'
  | 'production'
  | 'reusable'
  | 'search'

export interface ShotVocabularyTerm {
  id: string
  category: ShotVocabularyCategory
  labels: Record<string, string>
  aliases?: Record<string, string[]>
  description?: Record<string, string>
  searchWeight?: number
  vectorText?: Record<string, string>
}

export interface ShotQueryTranslation {
  locale: string
  originalQuery: string
  canonicalTags: Partial<Record<ShotVocabularyCategory, string[]>>
  expandedKeywords: string[]
  terms: string[]
  vectorText: string
  confidence: number
}

export const SHOT_VOCABULARY: ShotVocabularyTerm[] = [
  term('reveal_information', 'intent', '揭示信息', 'Reveal information', ['发现真相', '揭开真相', '发现线索', '信息揭示'], ['reveal', 'discovery', 'find the truth']),
  term('create_tension', 'intent', '制造紧张感', 'Create tension', ['气氛变紧', '气氛慢慢变紧', '压迫感', '紧张感', '悬疑感'], ['tension', 'suspense', 'pressure']),
  term('isolate_character', 'intent', '突出角色孤立', 'Isolate character', ['孤独', '孤立', '疏离', '一个人'], ['lonely', 'isolate', 'alone']),
  term('evoke_memory', 'intent', '唤起回忆', 'Evoke memory', ['回忆', '记忆感', '怀旧'], ['memory', 'nostalgia']),
  term('show_power_shift', 'intent', '表现权力变化', 'Show power shift', ['权力变化', '威胁', '压制'], ['power shift', 'threat', 'dominance']),
  term('slow_viewer_down', 'intent', '让观众放慢感受', 'Slow the viewer down', ['慢下来', '沉浸感', '停顿感'], ['slow down', 'linger']),
  term('guide_attention', 'intent', '引导注意力', 'Guide attention', ['引导视线', '强调重点'], ['guide attention', 'direct focus']),

  term('slow_push_in', 'pattern', '慢推近', 'Slow push-in', ['慢慢推近', '镜头缓慢靠近', '慢慢靠近', '靠近角色脸', '压迫式推进'], ['slow dolly in', 'push in', 'gradual push']),
  term('handheld_follow', 'pattern', '手持跟拍', 'Handheld follow', ['手持', '跟拍', '晃动跟随'], ['handheld', 'handheld follow', 'shaky follow']),
  term('foreground_obstruction', 'pattern', '前景遮挡', 'Foreground obstruction', ['遮挡', '门框遮挡', '窗框遮挡', '偷看感'], ['foreground obstruction', 'frame obstruction', 'hidden observer']),
  term('negative_space_pressure', 'pattern', '留白压迫', 'Negative-space pressure', ['留白', '空镜压迫', '空旷压迫', '远景孤立'], ['negative space', 'wide empty frame']),
  term('reaction_close_up', 'pattern', '反应特写', 'Reaction close-up', ['表情特写', '脸部特写', '反应镜头'], ['reaction close-up', 'face close-up']),
  term('static_observation', 'pattern', '静态观察', 'Static observation', ['固定机位', '静静观察', '克制观察'], ['locked-off', 'static observation']),
  term('insert_detail', 'pattern', '细节插入', 'Insert detail', ['细节镜头', '物件特写', '线索特写'], ['insert shot', 'detail insert']),

  term('reference_moment', 'shotFunction', '参考片刻', 'Reference moment', ['参考镜头', '参考片段'], ['reference shot']),
  term('visual_cue', 'shotFunction', '视觉提示', 'Visual cue', ['视觉线索', '提示信息'], ['visual cue']),
  term('tension_buildup', 'shotFunction', '铺垫紧张', 'Tension buildup', ['紧张铺垫', '逐渐紧张', '气氛累积'], ['tension buildup']),
  term('emotional_pause', 'shotFunction', '情绪停顿', 'Emotional pause', ['情绪停留', '沉默停顿'], ['emotional pause']),
  term('delayed_reveal', 'shotFunction', '延迟揭示', 'Delayed reveal', ['延迟揭露', '先藏后露', '慢慢揭示'], ['delayed reveal']),
  term('build_tension', 'shotFunction', '积累紧张', 'Build tension', ['积累压迫', '紧张累积'], ['build tension']),

  term('landscape_frame', 'visualPreference', '横构图', 'Landscape frame', ['横屏', '横画幅'], ['landscape']),
  term('vertical_frame', 'visualPreference', '竖构图', 'Vertical frame', ['竖屏', '竖画幅'], ['vertical']),
  term('square_frame', 'visualPreference', '方构图', 'Square frame', ['方画幅'], ['square']),
  term('restrained_pacing', 'visualPreference', '克制节奏', 'Restrained pacing', ['克制', '慢节奏', '不急'], ['restrained pacing']),
  term('compact_pacing', 'visualPreference', '紧凑节奏', 'Compact pacing', ['紧凑', '快速'], ['compact pacing']),
  term('video_reference', 'visualPreference', '视频参考', 'Video reference', ['视频镜头'], ['video reference']),

  term('reference_mood', 'emotionalEffect', '参考氛围', 'Reference mood', ['氛围参考'], ['reference mood']),
  term('suspense', 'emotionalEffect', '悬疑感', 'Suspense', ['悬疑', '紧张', '不安'], ['suspense', 'unease']),
  term('isolation', 'emotionalEffect', '孤立感', 'Isolation', ['孤独感', '疏离感'], ['isolation', 'loneliness']),

  term('medium_shot', 'visual', '中景', 'Medium shot', ['中景镜头'], ['medium shot']),
  term('close_up', 'visual', '特写', 'Close-up', ['近景', '脸部特写'], ['close-up']),
  term('wide_shot', 'visual', '远景', 'Wide shot', ['大远景', '环境远景'], ['wide shot']),
  term('eye_level', 'visual', '平视角度', 'Eye level', ['平视'], ['eye level']),
  term('standing_eye_level', 'visual', '站立平视高度', 'Standing eye level', ['站立视线高度'], ['standing eye level']),
  term('normal_lens', 'visual', '标准镜头', 'Normal lens', ['普通焦段'], ['normal lens']),
  term('moderate_depth', 'visual', '中等景深', 'Moderate depth of field', ['中景深'], ['moderate depth']),
  term('hold_focus', 'visual', '保持焦点', 'Hold focus', ['固定焦点'], ['hold focus']),
  term('soft_or_rack_reveal', 'visual', '虚实揭示', 'Soft or rack reveal', ['焦点转换揭示', '虚焦后揭示'], ['rack reveal', 'soft reveal']),
  term('subject', 'visual', '主体', 'Subject', ['角色主体'], ['subject']),
  term('static', 'visual', '静止机位', 'Static camera', ['固定镜头'], ['static']),
  term('still', 'visual', '静止速度', 'Still', ['不移动'], ['still']),
  term('locked_off', 'visual', '锁定机位', 'Locked-off', ['固定机位'], ['locked-off']),
  term('push_in', 'visual', '推近', 'Push in', ['推进', '靠近'], ['push in']),
  term('slow', 'visual', '缓慢', 'Slow', ['慢'], ['slow']),
  term('smooth', 'visual', '平滑稳定', 'Smooth', ['稳定顺滑'], ['smooth']),
  term('psychological_pressure', 'visual', '心理压迫', 'Psychological pressure', ['压迫感'], ['psychological pressure']),
  term('follow', 'visual', '跟随', 'Follow', ['跟拍'], ['follow']),
  term('reactive', 'visual', '反应式', 'Reactive', ['跟随反应'], ['reactive']),
  term('handheld', 'visual', '手持', 'Handheld', ['手持晃动'], ['handheld']),
  term('subjective_presence', 'visual', '主观在场感', 'Subjective presence', ['临场感'], ['subjective presence']),
  term('foreground_blur', 'visual', '前景虚化', 'Foreground blur', ['前景模糊'], ['foreground blur']),
  term('close_framing', 'visual', '贴近构图', 'Close framing', ['紧贴人物'], ['close framing']),
  term('negative_space', 'visual', '留白空间', 'Negative space', ['大面积留白'], ['negative space']),
  term('layered_depth', 'visual', '层次纵深', 'Layered depth', ['空间层次'], ['layered depth']),
  term('off_center_subject', 'visual', '主体偏置', 'Off-center subject', ['人物偏一侧'], ['off-center subject']),
  term('held_composition', 'visual', '持留构图', 'Held composition', ['停留构图'], ['held composition']),
  term('low_key', 'visual', '低调光', 'Low-key lighting', ['暗调光线'], ['low key']),
  term('naturalistic', 'visual', '自然光感', 'Naturalistic', ['自然主义光线'], ['naturalistic']),
  term('medium', 'visual', '中等', 'Medium', ['适中'], ['medium']),
  term('medium_high', 'visual', '中高', 'Medium high', ['偏高'], ['medium high']),
  term('cool_muted', 'visual', '冷调低饱和', 'Cool muted', ['冷色压低饱和'], ['cool muted']),
  term('neutral', 'visual', '中性', 'Neutral', ['中性色'], ['neutral']),
  term('low', 'visual', '低', 'Low', ['较低'], ['low']),
  term('large', 'visual', '空间大', 'Large', ['宽阔'], ['large']),
  term('empty', 'visual', '空旷', 'Empty', ['空'], ['empty']),
  term('distant', 'visual', '疏离', 'Distant', ['远离'], ['distant']),
  term('isolating', 'visual', '孤立空间', 'Isolating', ['孤立感空间'], ['isolating']),
  term('reference_space', 'visual', '参考空间', 'Reference space', ['参考环境'], ['reference space']),
  term('readable', 'visual', '可读清晰', 'Readable', ['看得清'], ['readable']),
  term('partially_obscured', 'visual', '部分遮挡', 'Partially obscured', ['半遮挡'], ['partially obscured']),
  term('reaction', 'visual', '反应表情', 'Reaction', ['反应'], ['reaction']),
  term('reacts', 'visual', '作出反应', 'Reacts', ['反应动作'], ['reacts']),
  term('reference_action', 'visual', '参考动作', 'Reference action', ['动作参考'], ['reference action']),

  term('drama', 'scene', '剧情', 'Drama', ['剧情戏'], ['drama']),
  term('thriller', 'scene', '悬疑/惊悚', 'Thriller', ['悬疑类型'], ['thriller']),
  term('reference_moment', 'scene', '参考时刻', 'Reference moment', ['参考段落'], ['reference moment']),
  term('suspense_or_discovery', 'scene', '悬疑或发现', 'Suspense or discovery', ['发现真相场景', '悬疑发现'], ['suspense discovery']),
  term('discovery', 'scene', '发现', 'Discovery', ['发现线索'], ['discovery']),
  term('office_interior', 'scene', '办公室内景', 'Office interior', ['办公室'], ['office interior']),
  term('interior', 'scene', '室内', 'Interior', ['内景'], ['interior']),
  term('unspecified', 'scene', '未指定', 'Unspecified', ['未标注'], ['unspecified']),
  term('small_to_medium', 'scene', '小到中等规模', 'Small to medium scale', ['中小规模'], ['small to medium']),
  term('before_reveal', 'scene', '揭示前', 'Before reveal', ['真相揭示前'], ['before reveal']),
  term('reveal', 'scene', '揭示时刻', 'Reveal', ['揭晓'], ['reveal']),
  term('distance_or_disconnection', 'scene', '疏离关系', 'Distance or disconnection', ['关系疏离'], ['distance disconnection']),

  term('present_information', 'narrative', '呈现信息', 'Present information', ['给出信息'], ['present information']),
  term('withhold_then_reveal', 'narrative', '隐藏后揭示', 'Withhold then reveal', ['先藏后露', '延迟揭示'], ['withhold then reveal']),
  term('setup_or_payoff', 'narrative', '铺垫或兑现', 'Setup or payoff', ['铺垫兑现'], ['setup payoff']),
  term('reference', 'narrative', '参考段落', 'Reference', ['参考'], ['reference']),
  term('continues_attention', 'narrative', '延续注意力', 'Continues attention', ['承接注意力'], ['continues attention']),
  term('supports_next_cut', 'narrative', '支撑下一剪', 'Supports next cut', ['连接下一个镜头'], ['supports next cut']),
  term('narrows_attention', 'narrative', '收窄注意力', 'Narrows attention', ['聚焦视线'], ['narrows attention']),
  term('prepares_reaction', 'narrative', '准备反应镜头', 'Prepares reaction', ['引出反应'], ['prepares reaction']),
  term('motivates_reaction', 'narrative', '触发反应', 'Motivates reaction', ['推动反应'], ['motivates reaction']),
  term('guide_attention', 'narrative', '引导注意力', 'Guide attention', ['引导视线'], ['guide attention']),

  term('negative', 'emotion', '负向情绪', 'Negative', ['负面', '不安'], ['negative']),
  term('neutral', 'emotion', '中性情绪', 'Neutral', ['中性'], ['neutral']),
  term('medium_high', 'emotion', '中高唤醒', 'Medium-high arousal', ['偏紧张'], ['medium high arousal']),
  term('low_medium', 'emotion', '中低唤醒', 'Low-medium arousal', ['低到中等'], ['low medium arousal']),
  term('hidden_observer', 'emotion', '隐蔽观察者', 'Hidden observer', ['偷看者视角'], ['hidden observer']),
  term('distant_observer', 'emotion', '疏离观察者', 'Distant observer', ['远距离旁观'], ['distant observer']),
  term('observer', 'emotion', '观察者', 'Observer', ['旁观'], ['observer']),
  term('unease', 'emotion', '不安', 'Unease', ['不安感'], ['unease']),
  term('loneliness', 'emotion', '孤独', 'Loneliness', ['孤独感'], ['loneliness']),

  term('cut', 'production', '硬切', 'Cut', ['直接切入'], ['cut']),
  term('cut_to_next_beat', 'production', '切到下一节拍', 'Cut to next beat', ['切到下一个情节点'], ['cut to next beat']),
  term('reference_shot', 'production', '参考镜头', 'Reference shot', ['镜头参考'], ['reference shot']),
  term('slow_dolly_or_gimbal', 'production', '慢速轨道或稳定器', 'Slow dolly or gimbal', ['轨道车', '稳定器慢推'], ['slow dolly', 'gimbal']),
  term('foreground_layer', 'production', '前景层', 'Foreground layer', ['前景物'], ['foreground layer']),
  term('controlled_focus', 'production', '可控焦点', 'Controlled focus', ['控制焦点'], ['controlled focus']),
  term('handheld_operator', 'production', '手持摄影', 'Handheld operator', ['手持操作'], ['handheld operator']),
  term('medium', 'production', '中等难度', 'Medium difficulty', ['中等'], ['medium difficulty']),
]

export const SHOT_FIELD_LABELS: Record<string, Record<string, string>> = {
  shot_size: label('景别', 'Shot size'),
  camera_angle: label('摄影角度', 'Camera angle'),
  camera_height: label('摄影机高度', 'Camera height'),
  framing: label('取景方式', 'Framing'),
  composition: label('构图', 'Composition'),
  lens: label('镜头/光学', 'Lens'),
  focus: label('焦点', 'Focus'),
  movement: label('镜头运动', 'Camera movement'),
  lighting: label('光线', 'Lighting'),
  color: label('色彩', 'Color'),
  environment: label('空间环境', 'Environment'),
  character: label('角色', 'Character'),
  primary: label('主要功能', 'Primary function'),
  secondary: label('辅助功能', 'Secondary function'),
  information_state: label('信息状态', 'Information state'),
  sequence_position: label('段落位置', 'Sequence position'),
  relation_to_previous: label('与前镜头关系', 'Relation to previous'),
  relation_to_next: label('与后镜头关系', 'Relation to next'),
  genre: label('类型', 'Genre'),
  scene_type: label('场景类型', 'Scene type'),
  location_type: label('地点类型', 'Location type'),
  relationship_state: label('人物关系', 'Relationship state'),
  conflict_level: label('冲突强度', 'Conflict level'),
  story_beat: label('剧情节拍', 'Story beat'),
  production_scale: label('制作规模', 'Production scale'),
  principle: label('复用原则', 'Reusable principle'),
  pattern_ids: label('方法 ID', 'Pattern IDs'),
  works_when: label('适用条件', 'Works when'),
  avoid_when: label('避免使用', 'Avoid when'),
  obstruction_type: label('遮挡类型', 'Obstruction type'),
  subject_visibility: label('主体可见度', 'Subject visibility'),
  camera_distance_change: label('距离变化', 'Camera distance change'),
  reveal_speed: label('揭示速度', 'Reveal speed'),
  space_ratio: label('空间比例', 'Space ratio'),
  queries: label('自然语言检索例句', 'Natural-language queries'),
  visual_facets: label('画面检索线索', 'Visual search facets'),
  narrative_facets: label('叙事检索线索', 'Narrative search facets'),
  emotion_facets: label('情绪检索线索', 'Emotion search facets'),
  pattern_facets: label('方法检索线索', 'Pattern search facets'),
  production_facets: label('执行检索线索', 'Production search facets'),
  start_sec: label('开始秒', 'Start second'),
  end_sec: label('结束秒', 'End second'),
  duration: label('时长', 'Duration'),
  resolution: label('分辨率', 'Resolution'),
  aspect_ratio: label('画幅', 'Aspect ratio'),
  coverage_role: label('镜头用途', 'Coverage role'),
  transition_in: label('入点方式', 'Transition in'),
  transition_out: label('出点方式', 'Transition out'),
  difficulty: label('执行难度', 'Difficulty'),
  blocking: label('调度方式', 'Blocking'),
  requirement: label('执行条件', 'Requirement'),
}

const TERM_BY_KEY = new Map(SHOT_VOCABULARY.map(item => [`${item.category}:${item.id}`, item]))

export function localizeShotTerm(category: ShotVocabularyCategory, value: string, locale: string): string {
  const clean = value.trim()
  if (!clean) return clean
  const direct = TERM_BY_KEY.get(`${category}:${clean}`)
  if (direct) return localizedText(direct.labels, locale) ?? clean
  const fallback = SHOT_VOCABULARY.find(item => item.id === clean)
  return fallback ? localizedText(fallback.labels, locale) ?? clean : clean
}

export function localizeShotSemanticValue(category: ShotLibrarySemanticCategory, value: string, locale: string): string {
  return localizeShotTerm(category, value, locale)
}

export function localizeAnyShotValue(value: string, locale: string): string {
  const clean = value.trim()
  if (!clean) return clean
  const exact = SHOT_VOCABULARY.find(item => item.id === clean)
  return exact ? localizedText(exact.labels, locale) ?? clean : clean
}

export function localizeShotField(field: string, locale: string): string {
  const key = field.split('.').at(-1) ?? field
  return localizedText(SHOT_FIELD_LABELS[field] ?? SHOT_FIELD_LABELS[key], locale) ?? key
}

export function localizeShotFieldValue(field: string, value: string, locale: string): string {
  const category = categoryForField(field)
  if (!category) return value
  return localizeShotTerm(category, value, locale)
}

export function localizeShotFacetValue(category: keyof Required<ShotLibraryFacetFilters>, value: string, locale: string): string {
  return localizeShotTerm(facetVocabularyCategory(category), value, locale)
}

export function translateShotQuery(query: string, locale: string): ShotQueryTranslation {
  const normalizedQuery = normalizeForSearch(query)
  const canonicalTags: Partial<Record<ShotVocabularyCategory, string[]>> = {}
  const expanded = new Set<string>()
  const matched = new Set<string>()

  for (const part of splitSearchTerms(query)) expanded.add(part)
  if (normalizedQuery) expanded.add(query.trim())

  for (const item of SHOT_VOCABULARY) {
    const probes = vocabularyProbeTexts(item, locale)
    if (!probes.some(probe => probeMatchesQuery(normalizedQuery, probe))) continue
    matched.add(`${item.category}:${item.id}`)
    pushCanonicalTag(canonicalTags, item.category, item.id)
    expanded.add(item.id)
    for (const probe of probes) expanded.add(probe)
    for (const text of Object.values(item.vectorText ?? {})) expanded.add(text)
  }

  const expandedKeywords = Array.from(expanded)
    .map(value => value.trim())
    .filter(Boolean)
  const queryTerms = splitSearchTerms(query)
  const terms = uniqueStrings([
    ...queryTerms,
    ...expandedKeywords.map(normalizeForSearch),
  ].filter(isUsefulSearchTerm))
  const matchedCount = matched.size
  return {
    locale,
    originalQuery: query,
    canonicalTags,
    expandedKeywords: uniqueStrings(expandedKeywords),
    terms,
    vectorText: uniqueStrings(expandedKeywords).join(' '),
    confidence: normalizedQuery ? Math.min(1, matchedCount / 3) : 0,
  }
}

export function shotSearchBackendQuery(query: string, locale: string): string {
  const translation = translateShotQuery(query, locale)
  if (!query.trim()) return ''
  return uniqueStrings([
    query.trim(),
    ...Object.values(translation.canonicalTags).flatMap(values => values ?? []),
    ...translation.expandedKeywords,
  ]).slice(0, 80).join(' ')
}

export function categoryForFacetMatch(category: string): ShotVocabularyCategory | undefined {
  if (category === 'visual') return 'visual'
  if (category === 'narrative') return 'narrative'
  if (category === 'emotion') return 'emotion'
  if (category === 'pattern') return 'pattern'
  if (category === 'production') return 'production'
  if (category === 'tag') return undefined
  return undefined
}

function term(id: string, category: ShotVocabularyCategory, zh: string, en: string, zhAliases: string[] = [], enAliases: string[] = []): ShotVocabularyTerm {
  return {
    id,
    category,
    labels: label(zh, en),
    aliases: {
      'zh-CN': zhAliases,
      'en-US': enAliases,
    },
    vectorText: {
      'zh-CN': [zh, ...zhAliases].join(' '),
      'en-US': [en, ...enAliases].join(' '),
    },
  }
}

function label(zh: string, en: string): Record<string, string> {
  return { 'zh-CN': zh, 'en-US': en }
}

function localizedText(values: Record<string, string> | undefined, locale: string): string | undefined {
  if (!values) return undefined
  if (locale.toLowerCase().startsWith('zh')) return values['zh-CN'] ?? values['en-US']
  return values['en-US'] ?? values['zh-CN']
}

function vocabularyProbeTexts(item: ShotVocabularyTerm, locale: string): string[] {
  const primaryAliases = locale.toLowerCase().startsWith('zh') ? item.aliases?.['zh-CN'] : item.aliases?.['en-US']
  return uniqueStrings([
    item.id,
    ...Object.values(item.labels),
    ...(primaryAliases ?? []),
    ...(item.aliases?.['zh-CN'] ?? []),
    ...(item.aliases?.['en-US'] ?? []),
    ...Object.values(item.vectorText ?? {}),
  ]).filter(value => normalizeForSearch(value).length > 0)
}

function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[，。！？、；：,.!?;:()[\]{}"'`~|/\\_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitSearchTerms(value: string): string[] {
  return normalizeForSearch(value).split(/\s+/).filter(Boolean)
}

function probeMatchesQuery(normalizedQuery: string, probe: string): boolean {
  const normalizedProbe = normalizeForSearch(probe)
  if (!normalizedProbe) return false
  if (/^[a-z0-9]+$/.test(normalizedProbe) && normalizedProbe.length <= 4) {
    return normalizedQuery.split(/\s+/).includes(normalizedProbe)
  }
  return normalizedQuery.includes(normalizedProbe)
}

function isUsefulSearchTerm(value: string): boolean {
  if (!value) return false
  if (/^[a-z]+$/.test(value) && ['the', 'and', 'or', 'to', 'in', 'of', 'a', 'an'].includes(value)) return false
  if (/^[a-z0-9]+$/.test(value) && value.length < 3) return false
  return true
}

function pushCanonicalTag(target: Partial<Record<ShotVocabularyCategory, string[]>>, category: ShotVocabularyCategory, value: string) {
  const values = target[category] ?? []
  if (!values.includes(value)) target[category] = [...values, value]
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function categoryForField(field: string): ShotVocabularyCategory | undefined {
  if (field.startsWith('narrative') || ['primary', 'secondary', 'information_state', 'sequence_position', 'relation_to_previous', 'relation_to_next'].includes(field)) return 'narrative'
  if (field.startsWith('scene') || ['genre', 'scene_type', 'location_type', 'relationship_state', 'conflict_level', 'story_beat', 'production_scale'].includes(field)) return 'scene'
  if (field.startsWith('emotion')) return 'emotion'
  if (field.startsWith('execution') || ['coverage_role', 'transition_in', 'transition_out', 'difficulty', 'requirement'].includes(field)) return 'production'
  if (field.startsWith('reusable') || ['pattern_ids', 'works_when', 'avoid_when'].includes(field)) return 'reusable'
  if (field.includes('facets')) return field.includes('narrative') ? 'narrative' : field.includes('emotion') ? 'emotion' : field.includes('pattern') ? 'pattern' : field.includes('production') ? 'production' : 'visual'
  return 'visual'
}

function facetVocabularyCategory(category: keyof Required<ShotLibraryFacetFilters>): ShotVocabularyCategory {
  switch (category) {
    case 'visual':
      return 'visual'
    case 'narrative':
      return 'narrative'
    case 'emotion':
      return 'emotion'
    case 'pattern':
      return 'pattern'
    case 'production':
      return 'production'
  }
}
