import { byOrder, clampProgress, dedupeRecords, firstText, titleOfRecord } from '@/lib/contentWorkbenchRecordUtils'
import type { SettingPreparationData, SettingPreparationRecord } from '@/lib/settingPreparationDataController'
import type {
  WorkbenchScenarioPriority as Priority,
  WorkbenchScenarioStatus as WorkStatus,
} from '@/lib/workbenchScenarios'

export interface SettingPrepRow {
  id: string
  title: string
  kind: string
  status: WorkStatus
  rawStatus: string
  priority: Priority
  progress: number
  readinessLabel: string
  scope: string
  missing: string[]
  warnings: string[]
  record: SettingPreparationRecord
  states: SettingPreparationRecord[]
  usages: SettingPreparationRecord[]
  relationships: SettingPreparationRecord[]
  assetSlots: SettingPreparationRecord[]
  linkedSegments: SettingPreparationRecord[]
  linkedSceneMoments: SettingPreparationRecord[]
  linkedContentUnits: SettingPreparationRecord[]
  linkedProductions: SettingPreparationRecord[]
}

export function normalizeCreativeReferenceStatus(status?: string) {
  if (status === 'confirmed' || status === 'locked' || status === 'ignored' || status === 'merged') return status
  return 'draft'
}

export function creativeReferenceStatusLabel(status?: string) {
  const normalized = normalizeCreativeReferenceStatus(status)
  if (normalized === 'confirmed') return '已确认'
  if (normalized === 'locked') return '已锁定'
  if (normalized === 'ignored') return '已忽略'
  if (normalized === 'merged') return '已合并'
  return '草稿'
}

export function creativeReferenceStatusVariant(status?: string) {
  const normalized = normalizeCreativeReferenceStatus(status)
  if (normalized === 'confirmed' || normalized === 'locked' || normalized === 'merged') return 'success' as const
  if (normalized === 'ignored') return 'outline' as const
  return 'warning' as const
}

export function creativeUsageStatusLabel(status?: string) {
  if (status === 'confirmed') return '已确认'
  if (status === 'corrected') return '已修正'
  if (status === 'ignored') return '已忽略'
  if (status === 'draft') return '草稿'
  return firstText(status, '未设置')
}

export function creativeUsageStatusVariant(status?: string) {
  if (status === 'confirmed' || status === 'corrected') return 'success' as const
  if (status === 'ignored') return 'outline' as const
  if (status === 'draft') return 'warning' as const
  return 'outline' as const
}

export function creativeReferenceWorkStatus(status?: string): WorkStatus {
  const normalized = normalizeCreativeReferenceStatus(status)
  if (normalized === 'ignored') return 'blocked'
  if (normalized === 'draft') return 'review'
  return 'ready'
}

export function creativeReferenceKindLabel(kind?: string) {
  if (kind === 'person') return '人物'
  if (kind === 'character') return '人物'
  if (kind === 'place') return '地点'
  if (kind === 'location') return '地点'
  if (kind === 'scene') return '场景'
  if (kind === 'prop') return '道具'
  if (kind === 'product') return '产品'
  if (kind === 'brand') return '品牌'
  if (kind === 'style') return '风格'
  if (kind === 'world_rule') return '世界规则'
  if (kind === 'time_period') return '时间段'
  if (kind === 'restriction') return '限制'
  return firstText(kind, '设定')
}

export function parseCreativeProfileJSON(profileJSON?: string) {
  const raw = firstText(profileJSON, '')
  if (!raw) return { profileJson: '', visualIntent: '' }
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { profileJson: raw, visualIntent: '' }
    }
    const data = parsed as Record<string, unknown>
    const visualIntent = firstText(data.visual_intent, data.visualIntent, data.visual_notes, '')
    const cleaned = { ...data }
    delete cleaned.visual_intent
    delete cleaned.visualIntent
    delete cleaned.visual_notes
    return {
      profileJson: Object.keys(cleaned).length > 0 ? JSON.stringify(cleaned, null, 2) : '',
      visualIntent,
    }
  } catch {
    return { profileJson: raw, visualIntent: '' }
  }
}

export function composeCreativeProfileJSON(profileJson: string, visualIntent: string) {
  const trimmedProfile = profileJson.trim()
  const trimmedVisual = visualIntent.trim()
  if (!trimmedProfile && !trimmedVisual) return ''
  try {
    const parsed = trimmedProfile ? JSON.parse(trimmedProfile) : {}
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid profile json')
    const next = { ...(parsed as Record<string, unknown>) }
    if (trimmedVisual) next.visual_intent = trimmedVisual
    else {
      delete next.visual_intent
      delete next.visualIntent
      delete next.visual_notes
    }
    return JSON.stringify(next, null, 2)
  } catch {
    if (!trimmedVisual) return trimmedProfile
    return JSON.stringify({
      raw_profile: trimmedProfile,
      visual_intent: trimmedVisual,
    }, null, 2)
  }
}

export function buildSettingPrepForm(record: SettingPreparationRecord) {
  const profile = parseCreativeProfileJSON(record.profile_json)
  return {
    name: firstText(record.name, record.title, record.label, ''),
    alias: firstText(record.alias, ''),
    kind: firstText(record.kind, 'person'),
    importance: firstText(record.importance, 'supporting'),
    status: normalizeCreativeReferenceStatus(record.status),
    description: firstText(record.description, ''),
    content: firstText(record.content, ''),
    visualIntent: profile.visualIntent,
    profileJson: profile.profileJson,
    tagsJson: firstText(record.tags_json, ''),
  }
}

export function buildSettingPrepUsageSummary(record: SettingPrepRow | null) {
  if (!record) return '暂无使用上下文'
  const productions = record.linkedProductions.slice(0, 2).map((item) => titleOfRecord(item))
  const segments = record.linkedSegments.slice(0, 2).map((item) => titleOfRecord(item))
  const moments = record.linkedSceneMoments.slice(0, 2).map((item) => titleOfRecord(item))
  const parts = [
    productions.length > 0 ? `制作 ${productions.join('、')}` : null,
    segments.length > 0 ? `编排段 ${segments.join('、')}` : null,
    moments.length > 0 ? `情景 ${moments.join('、')}` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' / ') : '暂无使用上下文'
}

export function buildSettingPrepEvidenceRows(record: SettingPrepRow | null) {
  if (!record) return []
  const lines: string[] = []
  for (const item of record.linkedSceneMoments.slice(0, 3)) {
    const line = [
      titleOfRecord(item),
      firstText(item.time_text, item.location_text, item.mood, item.description, item.action_text),
    ].filter(Boolean).join(' · ')
    if (line.trim()) lines.push(line)
  }
  for (const item of record.linkedSegments.slice(0, 2)) {
    const line = [
      titleOfRecord(item),
      firstText(item.summary, item.description, item.content),
    ].filter(Boolean).join(' · ')
    if (line.trim()) lines.push(line)
  }
  return lines.length > 0 ? lines : ['当前设定暂时没有绑定到可见剧本或编排上下文。']
}

export function buildSettingPrepRows(data?: SettingPreparationData): SettingPrepRow[] {
  if (!data) return []
  const segmentsById = new Map(data.segments.map((item) => [item.ID, item]))
  const momentsById = new Map(data.sceneMoments.map((item) => [item.ID, item]))
  const productionsById = new Map(data.productions.map((item) => [item.ID, item]))
  const contentUnitsById = new Map(data.contentUnits.map((item) => [item.ID, item]))

  return data.creativeReferences
    .slice()
    .sort((a, b) => byOrder(a, b))
    .map((record) => {
      const states = data.creativeReferenceStates.filter((state) => Number(state.creative_reference_id) === record.ID)
      const usages = data.creativeReferenceUsages.filter((usage) => Number(usage.creative_reference_id) === record.ID)
      const relatedAssetSlots = data.assetSlots.filter((slot) => Number(slot.creative_reference_id) === record.ID || states.some((state) => Number(slot.creative_reference_state_id) === state.ID))
      const relationships = data.creativeRelationships.filter((relation) => Number(relation.source_creative_reference_id) === record.ID || Number(relation.target_creative_reference_id) === record.ID)

      const linkedSegments = dedupeRecords([
        ...usages
          .filter((usage) => usage.owner_type === 'segment')
          .map((usage) => segmentsById.get(Number(usage.owner_id)))
          .filter((item): item is SettingPreparationRecord => Boolean(item)),
        ...relatedAssetSlots
          .filter((slot) => slot.owner_type === 'segment')
          .map((slot) => segmentsById.get(Number(slot.owner_id)))
          .filter((item): item is SettingPreparationRecord => Boolean(item)),
      ])
      const linkedSceneMoments = dedupeRecords([
        ...usages
          .filter((usage) => usage.owner_type === 'scene_moment')
          .map((usage) => momentsById.get(Number(usage.owner_id)))
          .filter((item): item is SettingPreparationRecord => Boolean(item)),
        ...relatedAssetSlots
          .filter((slot) => slot.owner_type === 'scene_moment')
          .map((slot) => momentsById.get(Number(slot.owner_id)))
          .filter((item): item is SettingPreparationRecord => Boolean(item)),
      ])
      const linkedContentUnits = dedupeRecords([
        ...usages
          .filter((usage) => usage.owner_type === 'content_unit')
          .map((usage) => contentUnitsById.get(Number(usage.owner_id)))
          .filter((item): item is SettingPreparationRecord => Boolean(item)),
        ...relatedAssetSlots
          .filter((slot) => slot.owner_type === 'content_unit')
          .map((slot) => contentUnitsById.get(Number(slot.owner_id)))
          .filter((item): item is SettingPreparationRecord => Boolean(item)),
      ])
      const linkedProductions = dedupeRecords([
        ...linkedSegments
          .map((segment) => segment.production_id ? productionsById.get(Number(segment.production_id)) : undefined)
          .filter((item): item is SettingPreparationRecord => Boolean(item)),
        ...linkedSceneMoments
          .map((moment) => moment.production_id ? productionsById.get(Number(moment.production_id)) : undefined)
          .filter((item): item is SettingPreparationRecord => Boolean(item)),
        ...linkedContentUnits
          .map((unit) => unit.production_id ? productionsById.get(Number(unit.production_id)) : undefined)
          .filter((item): item is SettingPreparationRecord => Boolean(item)),
      ])

      const title = firstText(record.name, record.title, record.label, record.alias, `${creativeReferenceKindLabel(record.kind)} #${record.ID}`)
      const hasDescription = Boolean(firstText(record.description, record.content))
      const hasVisualAnchor = Boolean(firstText(record.visual_intent, record.visual_notes, record.profile_json))
      const hasState = states.length > 0
      const hasUsage = usages.length > 0
      const hasAsset = relatedAssetSlots.length > 0
      const missing = [
        hasDescription ? null : '缺设定正文',
        hasVisualAnchor ? null : '缺视觉锚点',
        hasState ? null : '缺状态记录',
        hasUsage ? null : '缺使用上下文',
        normalizeCreativeReferenceStatus(record.status) === 'draft' ? '待定稿' : null,
      ].filter(Boolean) as string[]
      const warnings = [
        relationships.some((relation) => String(relation.category) === 'conflict') ? '存在冲突关系' : null,
        usages.length > 0 && normalizeCreativeReferenceStatus(record.status) === 'draft' ? '下游已在使用，建议先补完再定稿' : null,
      ].filter(Boolean) as string[]
      const progress = clampProgress(
        10 +
        (hasDescription ? 18 : 0) +
        (hasVisualAnchor ? 20 : 0) +
        (hasState ? 18 : 0) +
        (hasUsage ? 18 : 0) +
        (hasAsset ? 10 : 0) +
        (normalizeCreativeReferenceStatus(record.status) === 'confirmed' ? 8 : 0) +
        (normalizeCreativeReferenceStatus(record.status) === 'locked' ? 12 : 0),
      )
      const priority: Priority = (usages.length > 0 && missing.length > 0) || warnings.length > 0
        ? 'high'
        : usages.length > 0
          ? 'medium'
          : 'low'
      const status = creativeReferenceWorkStatus(record.status)
      const readinessLabel = missing.length === 0
        ? normalizeCreativeReferenceStatus(record.status) === 'locked'
          ? '已锁定，可下游引用'
          : normalizeCreativeReferenceStatus(record.status) === 'confirmed'
            ? '已确认，可继续使用'
            : '可进入确认'
        : `${missing.length} 个缺口`
      const scopeParts = [
        linkedProductions.length > 0 ? `${linkedProductions.length} 个制作` : '未绑定制作',
        linkedSegments.length > 0 ? `${linkedSegments.length} 个编排段` : '未绑定编排段',
        linkedSceneMoments.length > 0 ? `${linkedSceneMoments.length} 个情景` : '未绑定情景',
      ]

      return {
        id: String(record.ID),
        title,
        kind: creativeReferenceKindLabel(record.kind),
        status,
        rawStatus: normalizeCreativeReferenceStatus(record.status),
        priority,
        progress,
        readinessLabel,
        scope: scopeParts.join(' / '),
        missing,
        warnings,
        record,
        states,
        usages,
        relationships,
        assetSlots: relatedAssetSlots,
        linkedSegments,
        linkedSceneMoments,
        linkedContentUnits,
        linkedProductions,
      }
    })
}

export function buildSettingPrepAgentMessage(input: {
  projectName?: string
  row: SettingPrepRow
  evidence: string[]
  missing: string[]
}) {
  return [
    `请完善设定资料：${input.row.title}`,
    input.projectName ? `项目：${input.projectName}` : undefined,
    `类型：${input.row.kind}`,
    `状态：${creativeReferenceStatusLabel(input.row.rawStatus)}`,
    input.missing.length > 0 ? `缺口：${input.missing.join('、')}` : undefined,
    input.evidence.length > 0 ? `证据：${input.evidence.join('；')}` : undefined,
  ].filter(Boolean).join('\n')
}
