import type { SemanticEntityPayload, SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'

export type ProductionExpressionUnitType = 'dialogue' | 'action' | 'narration' | 'subtitle' | 'visual'

export type ProductionExpressionUnitEditTarget =
  | { kind: 'expressionUnits'; id: number }
  | { kind: 'fallback'; id: string; sceneMomentId: number; scriptBlockId?: number | null; order: number }

export interface ProductionExpressionUnitSavePayload {
  scene_moment_id?: number
  script_block_id?: number | null
  order?: number
  kind: ProductionExpressionUnitType
  speaker: string
  text: string
  note: string
  intent: string
}

export interface ProductionExpressionUnitLine {
  type: ProductionExpressionUnitType
  label: string
  speaker: string
  text: string
  editTarget: ProductionExpressionUnitEditTarget
  note: string
  intent: string
  persisted: boolean
}

export interface ProductionSpeakerOption {
  id: number
  name: string
  label: string
  current: boolean
}

export type ProductionSceneMomentRecord = SemanticEntityRecord & {
  segment_id?: number
  script_block_id?: number | null
  title?: string
  description?: string
  action_text?: string
  condition_text?: string
  location_text?: string
  mood?: string
  time_text?: string
}

export type ProductionScriptBlockRecord = SemanticEntityRecord & {
  kind?: string
  speaker?: string
  content?: string
  summary?: string
  title?: string
}

export type ProductionContentUnitRecord = SemanticEntityRecord & {
  kind?: string
  title?: string
  description?: string
  prompt?: string
  scene_moment_id?: number
  script_block_id?: number | null
}

export type ProductionExpressionUnitRecord = SemanticEntityRecord & {
  scene_moment_id?: number
  script_block_id?: number | null
  kind?: ProductionExpressionUnitType
  speaker?: string
  text?: string
  note?: string
  intent?: string
  order?: number
}

export type ProductionSettingRecord = SemanticEntityRecord & {
  name?: string
  title?: string
  kind?: string
}

export type ProductionAssetSlotRecord = SemanticEntityRecord & {
  name?: string
  title?: string
  owner_type?: string
  owner_id?: number
  setting_id?: number
}

export interface ProductionExpressionUnitLookup {
  contentUnitById: Map<number, ProductionContentUnitRecord>
  settingById: Map<number, ProductionSettingRecord>
  usagesByOwnerKey: Map<string, SemanticEntityRecord[]>
}

export function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

export function summarizeText(value: unknown, limit = 28) {
  const text = firstText(value).replace(/\s+/g, ' ')
  return text.length > limit ? `${text.slice(0, limit)}...` : text
}

export function buildExpressionUnitLines(
  moment: ProductionSceneMomentRecord | null | undefined,
  scriptBlock: ProductionScriptBlockRecord | null | undefined,
  contentUnits: ProductionContentUnitRecord[],
  expressions: ProductionExpressionUnitRecord[] = [],
): ProductionExpressionUnitLine[] {
  if (!moment) return []
  const persisted = expressions.slice().sort(byOrder)
  if (persisted.length > 0) {
    return persisted.map((item) => {
      const type = normalizeExpressionUnitType(item.kind)
      return {
        type,
        label: expressionUnitTypeLabel(type),
        speaker: firstText(item.speaker, defaultSpeakerForExpressionUnitType(type)),
        text: firstText(item.text),
        editTarget: { kind: 'expressionUnits', id: item.ID },
        note: firstText(item.note),
        intent: firstText(item.intent),
        persisted: true,
      }
    })
  }
  const lines: ProductionExpressionUnitLine[] = []
  let order = 1
  const actionText = firstText(moment.action_text, moment.description)
  if (actionText) {
    lines.push({
      type: 'action',
      label: '动作',
      speaker: '场面',
      text: actionText,
      editTarget: {
        kind: 'fallback',
        id: `moment-action-${moment.ID}`,
        sceneMomentId: moment.ID,
        scriptBlockId: moment.script_block_id ?? null,
        order: order++,
      },
      note: firstText(moment.condition_text, moment.location_text, '先让观众看清发生了什么。'),
      intent: '交代事件',
      persisted: false,
    })
  }
  if (moment.mood) {
    lines.push({
      type: 'action',
      label: '动作',
      speaker: titleOfRecord(moment),
      text: `停顿 / 节奏：${moment.mood}`,
      editTarget: { kind: 'fallback', id: `moment-mood-${moment.ID}`, sceneMomentId: moment.ID, scriptBlockId: moment.script_block_id ?? null, order: order++ },
      note: '这不是独立类型，而是动作条目里的停顿或表演提醒。',
      intent: '情绪转折',
      persisted: false,
    })
  }
  if (scriptBlock) {
    const type = expressionUnitTypeFromScriptBlock(scriptBlock)
    const content = firstText(scriptBlock.content, scriptBlock.summary, scriptBlock.title)
    if (content) {
      lines.push({
        type,
        label: expressionUnitTypeLabel(type),
        speaker: firstText(scriptBlock.speaker, type === 'dialogue' ? '未指定说话人' : expressionUnitTypeLabel(type)),
        text: content,
        editTarget: {
          kind: 'fallback',
          id: `script-block-${scriptBlock.ID}`,
          sceneMomentId: moment.ID,
          scriptBlockId: scriptBlock.ID,
          order: order++,
        },
        note: scriptBlock.kind === 'dialogue' ? '检查这句话是否符合人物此刻的克制程度。' : '来自当前剧本稿，可在这里判断是否需要改写。',
        intent: scriptBlock.kind === 'dialogue' ? '人物表达' : '剧本表达',
        persisted: false,
      })
    }
  }
  for (const unit of contentUnits.slice().sort(byOrder)) {
    const type = expressionUnitTypeFromContentUnit(unit)
    const text = firstText(unit.description, unit.prompt, unit.title)
    if (!text) continue
    lines.push({
      type,
      label: expressionUnitTypeLabel(type),
      speaker: type === 'narration' ? '旁白' : type === 'subtitle' ? '屏幕文字' : type === 'visual' ? '镜头' : '场面',
      text,
      editTarget: {
        kind: 'fallback',
        id: `content-unit-${unit.ID}`,
        sceneMomentId: moment.ID,
        scriptBlockId: unit.script_block_id ?? moment.script_block_id ?? null,
        order: order++,
      },
      note: '这是已有的表达补充，可以保留为当前稿参考。',
      intent: type === 'visual' ? '镜头描述' : type === 'narration' ? '补充情绪' : '表达补充',
      persisted: false,
    })
  }
  return lines
}

export function expressionUnitPayload(workspace: ProductionExpressionUnitSavePayload): SemanticEntityPayload {
  const normalized = normalizeExpressionUnitWorkspace(workspace)
  return {
    scene_moment_id: normalized.scene_moment_id ?? null,
    script_block_id: normalized.script_block_id ?? null,
    order: normalized.order ?? 0,
    kind: normalized.kind,
    speaker: normalized.speaker,
    text: normalized.text,
    note: normalized.note,
    intent: normalized.intent,
  }
}

export function buildSpeakerOptions(
  moment: ProductionSceneMomentRecord | null | undefined,
  settings: ProductionSettingRecord[],
  lookup: ProductionExpressionUnitLookup,
): ProductionSpeakerOption[] {
  const currentReferences = moment ? referencesForOwner('scene_moment', moment.ID, lookup).filter(isPersonReference) : []
  const currentIds = new Set(currentReferences.map((reference) => reference.ID))
  const allPeople = settings.filter(isPersonReference)
  const ordered = [...currentReferences, ...allPeople.filter((reference) => !currentIds.has(reference.ID))]
  const seenNames = new Set<string>()
  return ordered.flatMap((reference) => {
    const name = titleOfRecord(reference).trim()
    if (!name || seenNames.has(name)) return []
    seenNames.add(name)
    return [{
      id: reference.ID,
      name,
      label: currentIds.has(reference.ID) ? `${name} · 当前情节` : `${name} · 设定`,
      current: currentIds.has(reference.ID),
    }]
  })
}

export function referencesForOwner(ownerType: string, ownerId: number, lookup: ProductionExpressionUnitLookup) {
  return (lookup.usagesByOwnerKey.get(ownerKey(ownerType, ownerId)) ?? [])
    .map((usage) => usage.setting_id ? lookup.settingById.get(Number(usage.setting_id)) : null)
    .filter((reference): reference is ProductionSettingRecord => Boolean(reference))
}

export function isPersonReference(reference: ProductionSettingRecord) {
  return ['person', 'character'].includes(String(reference.kind ?? '').trim().toLowerCase())
}

export function isPlaceReference(reference: ProductionSettingRecord) {
  return ['place', 'location', 'scene'].includes(String(reference.kind ?? '').trim().toLowerCase())
}

export function settingKindLabel(kind?: string) {
  const normalized = String(kind ?? '').trim().toLowerCase()
  if (normalized === 'person' || normalized === 'character') return '人物'
  if (normalized === 'place' || normalized === 'location' || normalized === 'scene') return '场景'
  if (normalized === 'prop') return '道具'
  if (normalized === 'product') return '产品'
  if (normalized === 'brand') return '品牌'
  if (normalized === 'style') return '风格'
  if (normalized === 'world_rule') return '世界规则'
  if (normalized === 'time_period') return '时间段'
  if (normalized === 'restriction') return '限制'
  return firstText(kind, '设定')
}

export function isVisibleOrchestrationRecord(record: SemanticEntityRecord) {
  return !Boolean(record.__delete ?? record.deleted)
}

export function expressionUnitTypeLabel(type: ProductionExpressionUnitType) {
  switch (type) {
    case 'dialogue':
      return '对白'
    case 'action':
      return '动作'
    case 'narration':
      return '旁白'
    case 'subtitle':
      return '屏幕文字'
    case 'visual':
      return '镜头描述'
  }
}

export const expressionUnitTypeOptions: { value: ProductionExpressionUnitType; label: string }[] = [
  { value: 'dialogue', label: '对白' },
  { value: 'action', label: '动作' },
  { value: 'narration', label: '旁白' },
  { value: 'subtitle', label: '屏幕文字' },
  { value: 'visual', label: '镜头描述' },
]

export function normalizeExpressionUnitType(value: unknown): ProductionExpressionUnitType {
  return expressionUnitTypeOptions.some((option) => option.value === value) ? value as ProductionExpressionUnitType : 'action'
}

export function defaultSpeakerForExpressionUnitType(type: ProductionExpressionUnitType) {
  if (type === 'dialogue') return '未指定人物'
  if (type === 'narration') return '旁白'
  if (type === 'subtitle') return '屏幕文字'
  if (type === 'visual') return '镜头'
  return '场面'
}

export function speakerLabelForExpressionUnitType(type: ProductionExpressionUnitType) {
  if (type === 'dialogue') return '人物'
  if (type === 'narration') return '声源'
  if (type === 'subtitle') return '文字来源'
  if (type === 'visual') return '镜头主体'
  return '动作主体'
}

export function speakerPlaceholderForExpressionUnitType(type: ProductionExpressionUnitType) {
  if (type === 'dialogue') return '谁说'
  if (type === 'narration') return '旁白 / 画外音'
  if (type === 'subtitle') return '屏幕文字 / 标语'
  if (type === 'visual') return '镜头 / 产品 / 环境'
  return '谁在做'
}

export function textPlaceholderForExpressionUnitType(type: ProductionExpressionUnitType) {
  if (type === 'dialogue') return '写下人物会说出口的话'
  if (type === 'narration') return '写旁白'
  if (type === 'subtitle') return '写画面中真实出现的文字'
  if (type === 'visual') return '写镜头、产品或环境信息'
  return '写动作或事件推进'
}

export function expressionUnitLineWorkspace(line: ProductionExpressionUnitLine): ProductionExpressionUnitSavePayload {
  return normalizeExpressionUnitWorkspace({
    kind: line.type,
    speaker: line.speaker,
    text: line.text,
    note: line.note,
    intent: line.intent,
  })
}

export function normalizeExpressionUnitWorkspace(workspace: ProductionExpressionUnitSavePayload): ProductionExpressionUnitSavePayload {
  return {
    scene_moment_id: workspace.scene_moment_id,
    script_block_id: workspace.script_block_id ?? null,
    order: workspace.order,
    kind: normalizeExpressionUnitType(workspace.kind),
    speaker: workspace.speaker.trim(),
    text: workspace.text.trim(),
    note: workspace.note.trim(),
    intent: workspace.intent.trim(),
  }
}

export function expressionUnitWorkspaceEquals(a: ProductionExpressionUnitSavePayload, b: ProductionExpressionUnitSavePayload) {
  return normalizeExpressionUnitType(a.kind) === normalizeExpressionUnitType(b.kind)
    && a.speaker.trim() === b.speaker.trim()
    && a.text.trim() === b.text.trim()
    && a.note.trim() === b.note.trim()
    && a.intent.trim() === b.intent.trim()
}

export function speakerOptionValue(option: ProductionSpeakerOption) {
  return `reference:${option.id}`
}

export function speakerOptionValueForWorkspace(speaker: string, options: ProductionSpeakerOption[]) {
  const text = speaker.trim()
  const option = options.find((item) => item.name === text)
  return option ? speakerOptionValue(option) : '__custom__'
}

function expressionUnitTypeFromScriptBlock(block: ProductionScriptBlockRecord): ProductionExpressionUnitType {
  switch (block.kind) {
    case 'dialogue':
      return 'dialogue'
    case 'transition':
    case 'note':
    case 'parenthetical':
      return 'action'
    case 'scene_heading':
    case 'action':
    default:
      return 'action'
  }
}

function expressionUnitTypeFromContentUnit(unit: ProductionContentUnitRecord): ProductionExpressionUnitType {
  switch (unit.kind) {
    case 'voiceover':
      return 'narration'
    case 'dialogue_audio':
      return 'dialogue'
    case 'subtitle':
    case 'caption_card':
      return 'subtitle'
    case 'shot':
      return 'visual'
    case 'sound':
    case 'music_beat':
    case 'transition':
    default:
      return 'action'
  }
}

function byOrder<T extends { order?: number; ID: number }>(a: T, b: T) {
  const ao = typeof a.order === 'number' ? a.order : a.ID
  const bo = typeof b.order === 'number' ? b.order : b.ID
  return ao - bo
}

function titleOfRecord(record: SemanticEntityRecord | null | undefined) {
  return String(record?.title ?? record?.name ?? record?.label ?? `#${record?.ID ?? '-'}`)
}

function ownerKey(ownerType: string, ownerId: number) {
  return `${ownerType}:${ownerId}`
}
