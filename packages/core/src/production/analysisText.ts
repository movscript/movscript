export type ProductionAnalysisEntityRecordLike = {
  ID: number
  title?: unknown
  name?: unknown
  label?: unknown
  [key: string]: unknown
}

export type ProductionAnalysisScriptVersionLike = {
  title?: string
  content?: string
  raw_source?: string
  [key: string]: unknown
}

export type ProductionAnalysisScope = 'production' | 'segments' | 'segmentAnalysis' | 'sceneMoments' | 'settings' | 'assetSlots' | 'contentUnits'

export interface ProductionAnalysisTarget {
  scope: ProductionAnalysisScope
  entityId?: number | null
}

export type ProductionAnalysisProductionRecord = ProductionAnalysisEntityRecordLike & {
  script_version_id?: number
  name?: string
  description?: string
}

export type ProductionAnalysisSegmentRecord = ProductionAnalysisEntityRecordLike & {
  title?: string
  summary?: string
  content?: string
  production_id?: number
}

export type ProductionAnalysisSceneMomentRecord = ProductionAnalysisEntityRecordLike & {
  segment_id?: number
  title?: string
  time_text?: string
  location_text?: string
  action_text?: string
  description?: string
  mood?: string
}

export type ProductionAnalysisSettingRecord = ProductionAnalysisEntityRecordLike & {
  name?: string
  kind?: string
  importance?: string
  description?: string
  content?: string
  alias?: string
}

export type ProductionAnalysisAssetSlotRecord = ProductionAnalysisEntityRecordLike & {
  name?: string
  kind?: string
  priority?: string
  description?: string
  prompt_hint?: string
  owner_type?: string
  owner_id?: number
  setting_id?: number
}

export type ProductionAnalysisContentUnitRecord = ProductionAnalysisEntityRecordLike & {
  segment_id?: number
  scene_moment_id?: number
  title?: string
  kind?: string
  description?: string
  prompt?: string
  shot_size?: string
  camera_angle?: string
  camera_motion?: string
}

export interface ProductionAnalysisTextInput {
  manualText: string
  linkedVersion: ProductionAnalysisScriptVersionLike | null
  selectedSegment: ProductionAnalysisSegmentRecord | null
  production?: ProductionAnalysisProductionRecord | null
  segments: ProductionAnalysisSegmentRecord[]
  sceneMoments: ProductionAnalysisSceneMomentRecord[]
  settings: ProductionAnalysisSettingRecord[]
  assetSlots: ProductionAnalysisAssetSlotRecord[]
  contentUnits: ProductionAnalysisContentUnitRecord[]
}

export interface ProductionScopedScriptText {
  text: string
  scoped: boolean
  episodeOrder?: number
}

export function scopeScriptTextForProduction(
  scriptText: string,
  production?: ProductionAnalysisProductionRecord | null,
  scriptVersionTitle?: string,
): ProductionScopedScriptText {
  const text = scriptText.trim()
  const episodeOrder = inferEpisodeOrderForProduction(production, scriptVersionTitle)
  if (!text || !episodeOrder) return { text, scoped: false, episodeOrder: undefined }

  const ranges = findEpisodeTextRanges(text)
  const range = ranges.find((item) => item.order === episodeOrder)
  if (!range) return { text, scoped: false, episodeOrder }

  const scoped = text.slice(range.start, range.end).trim()
  if (!scoped || scoped.length >= text.length * 0.85) return { text, scoped: false, episodeOrder }
  return { text: scoped, scoped: true, episodeOrder }
}

export function getProductionAnalysisText(target: ProductionAnalysisTarget, input: ProductionAnalysisTextInput): string {
  const linkedText = (input.linkedVersion?.content || input.linkedVersion?.raw_source || '').trim()
  const scopedLinkedText = scopeScriptTextForProduction(linkedText, input.production, input.linkedVersion?.title).text
  const baseText = input.manualText.trim() || scopedLinkedText
  if (target.scope === 'production') return baseText

  if (target.scope === 'segments') return baseText

  if (target.scope === 'segmentAnalysis') {
    const segment = input.segments.find((item) => item.ID === target.entityId) ?? input.selectedSegment
    if (!segment) return baseText
    const moments = input.sceneMoments.filter((moment) => moment.segment_id === segment.ID)
    const units = input.contentUnits.filter((unit) => unit.segment_id === segment.ID)
    const refs = collectReferencesFromUnitsAndMoments(input.settings, input.assetSlots, moments, units)
    const slots = collectAssetSlotsFromSegment(input.assetSlots, segment.ID, moments, units)
    return [
      `编排段：${titleOfRecord(segment)}`,
      segment.summary ? `摘要：${segment.summary}` : '',
      segment.content ? `手记正文：\n${segment.content}` : '',
      moments.length > 0 ? `情节：\n${moments.map(serializeSceneMoment).join('\n\n')}` : '',
      units.length > 0 ? `创作片段：\n${units.map(serializeContentUnit).join('\n\n')}` : '',
      refs.length > 0 ? `相关设定资料：\n${refs.map(serializeSetting).join('\n\n')}` : '',
      slots.length > 0 ? `相关素材需求：\n${slots.map(serializeAssetSlot).join('\n\n')}` : '',
    ].filter(Boolean).join('\n\n')
  }

  if (target.scope === 'sceneMoments') {
    const moment = input.sceneMoments.find((item) => item.ID === target.entityId) ?? null
    if (!moment) return baseText
    const segmentRecord = input.segments.find((item) => item.ID === moment.segment_id) ?? null
    const units = input.contentUnits.filter((unit) => unit.scene_moment_id === moment.ID)
    const refs = collectReferencesFromUnitsAndMoments(input.settings, input.assetSlots, [moment], units)
    const slots = input.assetSlots.filter((slot) => (
      (slot.owner_type === 'scene_moment' && slot.owner_id === moment.ID) ||
      units.some((unit) => slot.owner_type === 'content_unit' && slot.owner_id === unit.ID)
    ))
    return [
      `情节：${titleOfRecord(moment)}`,
      moment.description ? `描述：${moment.description}` : '',
      moment.time_text ? `时间：${moment.time_text}` : '',
      moment.location_text ? `场景：${moment.location_text}` : '',
      moment.action_text ? `动作：${moment.action_text}` : '',
      moment.mood ? `情绪：${moment.mood}` : '',
      segmentRecord ? `所属编排段：${titleOfRecord(segmentRecord)}` : '',
      units.length > 0 ? `创作片段：\n${units.map(serializeContentUnit).join('\n\n')}` : '',
      refs.length > 0 ? `相关设定资料：\n${refs.map(serializeSetting).join('\n\n')}` : '',
      slots.length > 0 ? `相关素材需求：\n${slots.map(serializeAssetSlot).join('\n\n')}` : '',
    ].filter(Boolean).join('\n\n')
  }

  if (target.scope === 'settings') {
    const reference = input.settings.find((item) => item.ID === target.entityId) ?? null
    if (!reference) return baseText
    const usageKeys = new Set<string>()
    input.assetSlots
      .filter((slot) => slot.setting_id === reference.ID)
      .forEach((slot) => {
        if (slot.owner_type === 'segment' && slot.owner_id) usageKeys.add(ownerKey('segment', Number(slot.owner_id)))
        if (slot.owner_type === 'scene_moment' && slot.owner_id) usageKeys.add(ownerKey('scene_moment', Number(slot.owner_id)))
        if (slot.owner_type === 'content_unit' && slot.owner_id) usageKeys.add(ownerKey('content_unit', Number(slot.owner_id)))
      })
    const relatedMoments = input.sceneMoments.filter((moment) => usageKeys.has(ownerKey('scene_moment', moment.ID)))
    const relatedUnits = input.contentUnits.filter((unit) => usageKeys.has(ownerKey('content_unit', unit.ID)))
    const slots = input.assetSlots.filter((slot) => slot.setting_id === reference.ID)
    return [
      `设定资料：${titleOfRecord(reference)}`,
      reference.alias ? `别名：${reference.alias}` : '',
      reference.description ? `描述：${reference.description}` : '',
      reference.content ? `设定资料正文：\n${reference.content}` : '',
      relatedMoments.length > 0 ? `出现情节：${relatedMoments.map((item) => titleOfRecord(item)).join(' / ')}` : '',
      relatedUnits.length > 0 ? `相关内容：${relatedUnits.map((item) => titleOfRecord(item)).join(' / ')}` : '',
      slots.length > 0 ? `相关素材需求：\n${slots.map(serializeAssetSlot).join('\n\n')}` : '',
    ].filter(Boolean).join('\n\n')
  }

  if (target.scope === 'assetSlots') {
    const slot = input.assetSlots.find((item) => item.ID === target.entityId) ?? null
    if (!slot) return baseText
    const ownerLabel = formatOwnerLabel(String(slot.owner_type ?? ''), Number(slot.owner_id ?? 0), {
      segmentById: new Map(input.segments.map((item) => [item.ID, item])),
      sceneMomentById: new Map(input.sceneMoments.map((item) => [item.ID, item])),
      contentUnitById: new Map(input.contentUnits.map((item) => [item.ID, item])),
      settingById: new Map(input.settings.map((item) => [item.ID, item])),
    })
    const reference = slot.setting_id ? input.settings.find((item) => item.ID === slot.setting_id) ?? null : null
    return [
      `素材需求：${titleOfRecord(slot)}`,
      slot.kind ? `类型：${slot.kind}` : '',
      slot.priority ? `优先级：${slot.priority}` : '',
      slot.description ? `说明：${slot.description}` : '',
      slot.prompt_hint ? `创作提示：${slot.prompt_hint}` : '',
      ownerLabel ? `归属：${ownerLabel}` : '',
      reference ? `关联设定资料：${titleOfRecord(reference)}` : '',
    ].filter(Boolean).join('\n\n')
  }

  if (target.scope === 'contentUnits') {
    const unit = input.contentUnits.find((item) => item.ID === target.entityId) ?? null
    if (!unit) return baseText
    const segmentRecord = input.segments.find((item) => item.ID === unit.segment_id) ?? null
    const moment = input.sceneMoments.find((item) => item.ID === unit.scene_moment_id) ?? null
    const refs = collectReferencesFromUnitsAndMoments(input.settings, input.assetSlots, moment ? [moment] : [], [unit])
    const slots = input.assetSlots.filter((slot) => slot.owner_type === 'content_unit' && slot.owner_id === unit.ID)
    return [
      `创作片段：${titleOfRecord(unit)}`,
      unit.kind ? `类型：${unit.kind}` : '',
      unit.description ? `描述：${unit.description}` : '',
      unit.prompt ? `提示：${unit.prompt}` : '',
      unit.shot_size ? `景别：${unit.shot_size}` : '',
      unit.camera_angle ? `机位角度：${unit.camera_angle}` : '',
      unit.camera_motion ? `运镜：${unit.camera_motion}` : '',
      segmentRecord ? `所属编排段：${titleOfRecord(segmentRecord)}` : '',
      moment ? `所属情节：${titleOfRecord(moment)}` : '',
      refs.length > 0 ? `相关设定资料：\n${refs.map(serializeSetting).join('\n\n')}` : '',
      slots.length > 0 ? `相关素材需求：\n${slots.map(serializeAssetSlot).join('\n\n')}` : '',
    ].filter(Boolean).join('\n\n')
  }

  return baseText
}

function inferEpisodeOrderForProduction(
  production?: ProductionAnalysisProductionRecord | null,
  scriptVersionTitle?: string,
): number | undefined {
  const candidates = [
    String(production?.name ?? ''),
    String(production?.title ?? ''),
    String(production?.description ?? ''),
    String(scriptVersionTitle ?? ''),
  ]
  for (const candidate of candidates) {
    const order = parseEpisodeOrder(candidate)
    if (order) return order
  }
  return undefined
}

function findEpisodeTextRanges(text: string): Array<{ order: number; start: number; end: number }> {
  const ranges: Array<{ order: number; start: number; end: number }> = []
  const headingPattern = /(?:^|\n)[^\S\r\n]*(?:#{1,6}[^\S\r\n]*)?(?:《[^》]+》[^\S\r\n]*)?(?:第[^\S\r\n]*([0-9零〇一二三四五六七八九十百千万两]+)[^\S\r\n]*[集话回](?=$|\r?\n|[^\S\r\n]|[：:\-—])|(?:EP|E|Episode)[^\S\r\n]*0*([0-9]+)(?=$|\r?\n|[^\S\r\n]|[：:\-—]))(?:[^\S\r\n]*[：:\-—][^\S\r\n]*.*)?/gi
  let match: RegExpExecArray | null
  while ((match = headingPattern.exec(text)) !== null) {
    const token = match[1] || match[2]
    const order = parseEpisodeOrder(token)
    if (!order) continue
    ranges.push({
      order,
      start: match.index + (match[0].startsWith('\n') ? 1 : 0),
      end: text.length,
    })
  }
  for (let index = 0; index < ranges.length - 1; index += 1) {
    ranges[index].end = ranges[index + 1].start
  }
  return ranges
}

function parseEpisodeOrder(value: string): number | undefined {
  const text = String(value ?? '').trim()
  const match = text.match(/第\s*([0-9零〇一二三四五六七八九十百千万两]+)\s*[集话回]/)
    ?? text.match(/(?:EP|E|Episode)\s*0*([0-9]+)/i)
  const token = match?.[1] ?? (/^[0-9零〇一二三四五六七八九十百千万两]+$/.test(text) ? text : '')
  if (!token) return undefined
  if (/^\d+$/.test(token)) {
    const num = Number(token)
    return Number.isFinite(num) && num > 0 ? num : undefined
  }
  return parseChineseEpisodeNumber(token) || undefined
}

function collectReferencesFromUnitsAndMoments(
  settings: ProductionAnalysisSettingRecord[],
  assetSlots: ProductionAnalysisAssetSlotRecord[],
  moments: ProductionAnalysisSceneMomentRecord[],
  units: ProductionAnalysisContentUnitRecord[],
): ProductionAnalysisSettingRecord[] {
  const referenceIds = new Set<number>()
  const unitIds = new Set(units.map((item) => item.ID))
  const momentIds = new Set(moments.map((item) => item.ID))
  for (const slot of assetSlots) {
    if (slot.setting_id && (
      (slot.owner_type === 'scene_moment' && slot.owner_id && momentIds.has(Number(slot.owner_id))) ||
      (slot.owner_type === 'content_unit' && slot.owner_id && unitIds.has(Number(slot.owner_id))) ||
      (slot.owner_type === 'segment' && slot.owner_id && moments.some((moment) => moment.segment_id === Number(slot.owner_id)))
    )) {
      referenceIds.add(Number(slot.setting_id))
    }
  }
  return settings.filter((reference) => referenceIds.has(reference.ID))
}

function collectAssetSlotsFromSegment(
  assetSlots: ProductionAnalysisAssetSlotRecord[],
  segmentId: number,
  moments: ProductionAnalysisSceneMomentRecord[],
  units: ProductionAnalysisContentUnitRecord[],
): ProductionAnalysisAssetSlotRecord[] {
  const momentIds = new Set(moments.map((item) => item.ID))
  const unitIds = new Set(units.map((item) => item.ID))
  return assetSlots.filter((slot) => (
    (slot.owner_type === 'segment' && slot.owner_id === segmentId) ||
    (slot.owner_type === 'scene_moment' && slot.owner_id && momentIds.has(Number(slot.owner_id))) ||
    (slot.owner_type === 'content_unit' && slot.owner_id && unitIds.has(Number(slot.owner_id)))
  ))
}

function formatOwnerLabel(ownerType?: string, ownerId?: number, lookup?: {
  segmentById: Map<number, ProductionAnalysisSegmentRecord>
  sceneMomentById: Map<number, ProductionAnalysisSceneMomentRecord>
  contentUnitById: Map<number, ProductionAnalysisContentUnitRecord>
  settingById: Map<number, ProductionAnalysisSettingRecord>
}): string {
  if (!ownerType || !ownerId || !lookup) return ''
  if (ownerType === 'segment') return lookup.segmentById.get(ownerId) ? `编排段 · ${titleOfRecord(lookup.segmentById.get(ownerId))}` : `编排段 #${ownerId}`
  if (ownerType === 'scene_moment') return lookup.sceneMomentById.get(ownerId) ? `情节 · ${titleOfRecord(lookup.sceneMomentById.get(ownerId))}` : `情节 #${ownerId}`
  if (ownerType === 'content_unit') return lookup.contentUnitById.get(ownerId) ? `创作片段 · ${titleOfRecord(lookup.contentUnitById.get(ownerId))}` : `创作片段 #${ownerId}`
  if (ownerType === 'setting') return lookup.settingById.get(ownerId) ? `设定资料 · ${titleOfRecord(lookup.settingById.get(ownerId))}` : `设定资料 #${ownerId}`
  return `${ownerType} #${ownerId}`
}

function serializeSceneMoment(moment: ProductionAnalysisSceneMomentRecord): string {
  return [
    `- ${titleOfRecord(moment)}`,
    moment.time_text ? `时间：${moment.time_text}` : '',
    moment.location_text ? `场景：${moment.location_text}` : '',
    moment.action_text ? `动作：${moment.action_text}` : '',
    moment.description ? `描述：${moment.description}` : '',
  ].filter(Boolean).join('，')
}

function serializeSetting(reference: ProductionAnalysisSettingRecord): string {
  return [
    `- ${titleOfRecord(reference)}`,
    reference.kind ? `类型：${reference.kind}` : '',
    reference.importance ? `重要性：${reference.importance}` : '',
    reference.description ? `描述：${reference.description}` : '',
    reference.content ? `正文：${reference.content}` : '',
  ].filter(Boolean).join('，')
}

function serializeAssetSlot(slot: ProductionAnalysisAssetSlotRecord): string {
  return [
    `- ${titleOfRecord(slot)}`,
    slot.kind ? `类型：${slot.kind}` : '',
    slot.priority ? `优先级：${slot.priority}` : '',
    slot.description ? `说明：${slot.description}` : '',
    slot.prompt_hint ? `提示：${slot.prompt_hint}` : '',
  ].filter(Boolean).join('，')
}

function serializeContentUnit(unit: ProductionAnalysisContentUnitRecord): string {
  return [
    `- ${titleOfRecord(unit)}`,
    unit.kind ? `类型：${unit.kind}` : '',
    unit.description ? `描述：${unit.description}` : '',
    unit.prompt ? `提示：${unit.prompt}` : '',
    unit.shot_size ? `景别：${unit.shot_size}` : '',
    unit.camera_angle ? `机位：${unit.camera_angle}` : '',
  ].filter(Boolean).join('，')
}

function titleOfRecord(record: ProductionAnalysisEntityRecordLike | null | undefined): string {
  return String(record?.title ?? record?.name ?? record?.label ?? `#${record?.ID ?? '-'}`)
}

function ownerKey(ownerType: string, ownerId: number): string {
  return `${ownerType}:${ownerId}`
}

function parseChineseEpisodeNumber(value: string): number {
  const digitMap: Record<string, number> = {
    零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  }
  const unitMap: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000 }
  let total = 0
  let section = 0
  let number = 0
  for (const char of value) {
    if (char in digitMap) {
      number = digitMap[char]
      continue
    }
    const unit = unitMap[char]
    if (!unit) continue
    if (unit === 10000) {
      total += (section + number) * unit
      section = 0
      number = 0
      continue
    }
    section += (number || 1) * unit
    number = 0
  }
  return total + section + number
}
