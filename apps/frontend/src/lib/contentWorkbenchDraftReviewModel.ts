import type { AgentDraft } from './localAgentClient.ts'
import {
  contentWorkbenchProposalFieldString,
  contentWorkbenchProposalSnapshot,
  contentWorkbenchProposalUnitKey,
  contentWorkbenchProposalUnitTitle,
  normalizeContentWorkbenchProposalText,
} from './contentWorkbenchDraftProposal.ts'
import { firstText, numberOf, titleOfRecord } from './contentWorkbenchRecordUtils.ts'
import {
  contentUnitStoryboardBriefPromptText,
  contentUnitVisualPlanPromptText,
  metadataObject,
  parseMetadataJSON,
  textListFromMetadata,
} from './contentUnitPlanningMetadata.ts'
import { isRecord } from './jsonValue.ts'

export type ContentSnapshotDiffState = 'added' | 'changed' | 'unchanged' | 'planned'
export type ContentSnapshotDiffKind = 'content_unit' | 'keyframe'

export interface ContentSnapshotFieldDiff {
  label: string
  before?: string
  after?: string
}

export interface ContentSnapshotDiff {
  key: string
  state: ContentSnapshotDiffState
  kind: ContentSnapshotDiffKind
  title: string
  target: string
  detail: string
  impact: string
  before?: string
  after?: string
  fields: ContentSnapshotFieldDiff[]
  currentUnitId?: number
  proposal?: Record<string, unknown>
}

export interface ContentDraftReviewModel {
  draft: AgentDraft
  summary: string
  targetLabel: string
  diffs: ContentSnapshotDiff[]
  warnings: string[]
  stats: Array<{ label: string; value: number }>
}

export type ContentWorkbenchReviewRecord = {
  ID: number
  title?: unknown
  name?: unknown
  label?: unknown
  slot_key?: unknown
  kind?: unknown
  description?: unknown
  prompt?: unknown
  duration_sec?: unknown
  shot_size?: unknown
  camera_angle?: unknown
  camera_motion?: unknown
  metadata_json?: unknown
}

export type ContentWorkbenchReviewRow = {
  moment: ContentWorkbenchReviewRecord
  units: ContentWorkbenchReviewRecord[]
}

export function buildContentDraftReviewModel(
  draft: AgentDraft,
  context: {
    rowByMomentId: Map<number, ContentWorkbenchReviewRow>
    rowByUnitId: Map<number, ContentWorkbenchReviewRow>
  },
): ContentDraftReviewModel {
  const parsed = parseDraftJsonContent(draft.content)
  const warnings: string[] = []
  const diffs: ContentSnapshotDiff[] = []

  if (!parsed) {
    warnings.push('草案内容不是可解析的 JSON。')
    return {
      draft,
      summary: '草案内容无法解析，暂时不能做结构对比。',
      targetLabel: draft.title,
      diffs,
      warnings,
      stats: [],
    }
  }

  if (draft.kind === 'content_unit_proposal') {
    const sceneMomentId = draftEntityId(draft.target) || draftEntityId(draft.source) || numberOf(parsed.sceneMomentId ?? parsed.scene_moment_id)
    const row = sceneMomentId > 0 ? context.rowByMomentId.get(sceneMomentId) ?? null : null
    const proposal: Record<string, unknown> = isRecord(parsed.proposal) ? parsed.proposal : {}
    const proposedUnits = draftRecordsArray(proposal.units ?? parsed.units)
    const currentUnits = row?.units ?? []
    const usedCurrentIds = new Set<number>()

    if (!row) warnings.push('草案没有指向当前情节，无法做精确当前值对比。')
    if ('timeline_items' in proposal || 'timelineItems' in proposal || 'timeline_items' in parsed) {
      warnings.push('草案包含 production 级 timeline_items；制作项提案不会把它作为正式时间线快照审阅。请改用 unit.timing 表达局部节奏意图。')
    }

    proposedUnits.forEach((unit, index) => {
      if ('action' in unit) warnings.push(`草案制作项「${contentWorkbenchProposalUnitTitle(unit, index)}」包含旧版操作字段；snapshot 审阅不会把它当作草案语义。`)
      const current = matchCurrentContentUnit(unit, currentUnits, usedCurrentIds, index)
      const fields = compareContentUnitFields(current, unit)
      const state: ContentSnapshotDiffState = current ? (fields.length > 0 ? 'changed' : 'unchanged') : 'added'
      if (current) usedCurrentIds.add(current.ID)
      diffs.push({
        key: `unit-${index}-${current?.ID ?? contentWorkbenchProposalUnitKey(unit, index)}`,
        state,
        kind: 'content_unit',
        title: contentWorkbenchProposalUnitTitle(unit, index),
        target: current ? `当前制作项 #${current.ID}` : '新增制作项',
        detail: contentUnitChangeDetail(current, unit, fields),
        impact: contentUnitChangeImpact(state, current, fields),
        before: current ? contentUnitSnapshot(current) : undefined,
        after: contentWorkbenchProposalSnapshot(unit),
        fields,
        currentUnitId: current?.ID,
        proposal: unit,
      })
    })

    currentUnits.forEach((current) => {
      if (usedCurrentIds.has(current.ID)) return
      diffs.push({
        key: `removed-${current.ID}`,
        state: 'changed',
        kind: 'content_unit',
        title: titleOfRecord(current),
        target: `现有制作项 #${current.ID}`,
        detail: '草案未包含该制作项，属于收拢或删除候选。',
        impact: '可能移除当前制作项。',
        before: contentUnitSnapshot(current),
        after: '未出现在草案中',
        fields: [],
      })
      warnings.push(`现有制作项「${titleOfRecord(current)}」未出现在草案中。`)
    })

    const summary = [
      `${diffs.filter((item) => item.state === 'added').length} 个快照新增`,
      `${diffs.filter((item) => item.state === 'changed').length} 个快照变更`,
      `${diffs.filter((item) => item.state === 'unchanged').length} 个快照一致`,
    ].filter(Boolean).join('，')

    return {
      draft,
      summary,
      targetLabel: row ? titleOfRecord(row.moment) : draft.title,
      diffs,
      warnings,
      stats: [
        { label: '快照新增', value: diffs.filter((item) => item.state === 'added').length },
        { label: '快照变更', value: diffs.filter((item) => item.state === 'changed').length },
        { label: '快照一致', value: diffs.filter((item) => item.state === 'unchanged').length },
      ],
    }
  }

  return {
    draft,
    summary: '当前草案类型暂不支持内容编排审阅。',
    targetLabel: draft.title,
    diffs,
    warnings,
    stats: [],
  }
}

export function parseDraftJsonContent(content: string): Record<string, unknown> | null {
  const block = extractJsonBlock(content.trim())
  if (!block) return null
  try {
    const parsed = JSON.parse(block)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function draftEntityId(value?: Record<string, unknown>) {
  return numberOf(value?.entityId)
}

export function dedupeDrafts(drafts: AgentDraft[]) {
  const seen = new Set<string>()
  return drafts.filter((draft) => {
    if (seen.has(draft.id)) return false
    seen.add(draft.id)
    return true
  })
}

function extractJsonBlock(raw: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)
  if (fenced) return fenced[1].trim()
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first >= 0 && last > first) return raw.slice(first, last + 1)
  return raw.trim() || null
}

function draftRecordsArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function matchCurrentContentUnit(
  proposed: Record<string, unknown>,
  currentUnits: ContentWorkbenchReviewRecord[],
  usedCurrentIds: Set<number>,
  index: number,
) {
  const proposedTitle = normalizeContentWorkbenchProposalText(contentWorkbenchProposalFieldString(proposed, ['title']))
  const proposedKind = normalizeContentWorkbenchProposalText(contentWorkbenchProposalFieldString(proposed, ['kind']))
  const exact = currentUnits.find((unit) => !usedCurrentIds.has(unit.ID) && normalizeContentWorkbenchProposalText(titleOfRecord(unit)) === proposedTitle && normalizeContentWorkbenchProposalText(unit.kind) === proposedKind)
  if (exact) return exact
  const byTitle = currentUnits.find((unit) => !usedCurrentIds.has(unit.ID) && normalizeContentWorkbenchProposalText(titleOfRecord(unit)) === proposedTitle)
  if (byTitle) return byTitle
  const byKind = currentUnits.find((unit) => !usedCurrentIds.has(unit.ID) && normalizeContentWorkbenchProposalText(unit.kind) === proposedKind)
  if (byKind) return byKind
  return currentUnits.find((unit) => !usedCurrentIds.has(unit.ID) && index === 0) ?? undefined
}

function contentUnitSnapshot(unit: ContentWorkbenchReviewRecord) {
  return compactContentParts([
    titleOfRecord(unit),
    unit.kind,
    unit.description,
    unit.prompt,
    unit.duration_sec ? `${unit.duration_sec}s` : '',
    unit.shot_size,
    unit.camera_angle,
    unit.camera_motion,
  ])
}

function proposedContentUnitVisualPlanText(proposed: Record<string, unknown>) {
  const metadata = parseMetadataJSON(proposed.metadata_json)
  const visualPlan = metadataObject(proposed.visual_plan ?? metadata.visual_plan)
  return [
    firstText(visualPlan.space),
    firstText(visualPlan.blocking),
    firstText(visualPlan.camera_path),
    textListFromMetadata(visualPlan.beats),
    textListFromMetadata(visualPlan.props),
    firstText(visualPlan.lighting),
    textListFromMetadata(visualPlan.risks),
  ].filter(Boolean).join(' / ')
}

function proposedContentUnitStoryboardBriefText(proposed: Record<string, unknown>) {
  const metadata = parseMetadataJSON(proposed.metadata_json)
  const storyboardBrief = metadataObject(proposed.storyboard_brief ?? metadata.storyboard_brief)
  return [
    firstText(storyboardBrief.purpose),
    firstText(storyboardBrief.subject),
    firstText(storyboardBrief.composition),
    firstText(storyboardBrief.action_moment),
    firstText(storyboardBrief.emotion),
    textListFromMetadata(storyboardBrief.keyframe_suggestions),
  ].filter(Boolean).join(' / ')
}

function compareContentUnitFields(current: ContentWorkbenchReviewRecord | undefined, proposed: Record<string, unknown>): ContentSnapshotFieldDiff[] {
  const shot = isRecord(proposed.shot) ? proposed.shot : undefined
  const timing = isRecord(proposed.timing) ? proposed.timing : undefined
  return compactFieldChanges([
    { label: '标题', before: current ? titleOfRecord(current) : undefined, after: contentWorkbenchProposalUnitTitle(proposed, 0) },
    { label: '类型', before: current?.kind === undefined ? undefined : String(current.kind), after: contentWorkbenchProposalFieldString(proposed, ['kind']) },
    { label: '描述', before: current?.description === undefined ? undefined : String(current.description), after: contentWorkbenchProposalFieldString(proposed, ['description']) },
    { label: '提示词', before: current?.prompt === undefined ? undefined : String(current.prompt), after: contentWorkbenchProposalFieldString(proposed, ['prompt']) },
    { label: '时长', before: current?.duration_sec ? `${current.duration_sec}s` : undefined, after: numberOf(proposed.duration_sec) > 0 ? `${numberOf(proposed.duration_sec)}s` : undefined },
    { label: '景别', before: current?.shot_size === undefined ? undefined : String(current.shot_size), after: contentWorkbenchProposalFieldString(shot ?? {}, ['shot_size']) },
    { label: '机位', before: current?.camera_angle === undefined ? undefined : String(current.camera_angle), after: contentWorkbenchProposalFieldString(shot ?? {}, ['camera_angle']) },
    { label: '运动', before: current?.camera_motion === undefined ? undefined : String(current.camera_motion), after: contentWorkbenchProposalFieldString(shot ?? {}, ['camera_movement', 'camera_motion']) },
    { label: '视觉调度', before: current ? contentUnitVisualPlanPromptText(current) : undefined, after: proposedContentUnitVisualPlanText(proposed) },
    { label: '故事板', before: current ? contentUnitStoryboardBriefPromptText(current) : undefined, after: proposedContentUnitStoryboardBriefText(proposed) },
    { label: '局部开始', before: undefined, after: formatTimelineSeconds(timing?.local_start_sec) },
    { label: '节奏角色', before: undefined, after: contentWorkbenchProposalFieldString(timing ?? {}, ['rhythm_role']) },
    { label: '入场节奏', before: undefined, after: contentWorkbenchProposalFieldString(timing ?? {}, ['transition_in']) },
    { label: '出场节奏', before: undefined, after: contentWorkbenchProposalFieldString(timing ?? {}, ['transition_out']) },
  ])
}

function contentUnitChangeDetail(current: ContentWorkbenchReviewRecord | undefined, proposed: Record<string, unknown>, fields: ContentSnapshotFieldDiff[]) {
  if (!current) return compactContentParts([contentWorkbenchProposalFieldString(proposed, ['description']), contentWorkbenchProposalFieldString(proposed, ['prompt'])])
  if (fields.length === 0) return '与当前制作项一致，可视为复用。'
  return `调整 ${fields.map((field) => field.label).slice(0, 4).join('、')}`
}

function contentUnitChangeImpact(state: ContentSnapshotDiffState, current: ContentWorkbenchReviewRecord | undefined, fields: ContentSnapshotFieldDiff[]) {
  if (state === 'added') return '草案快照新增制作项。'
  if (state === 'unchanged') return '草案快照与当前制作项一致。'
  if (!current) return '新增或替换结构。'
  if (fields.some((field) => field.label === '标题' || field.label === '类型')) return '会改变该制作项的结构定位。'
  if (fields.some((field) => field.label === '提示词' || field.label === '描述')) return '会改变该制作项的创作意图。'
  if (fields.some((field) => field.label === '视觉调度' || field.label === '故事板')) return '会改变该制作项的视觉执行计划。'
  if (fields.some((field) => field.label.includes('节奏') || field.label === '局部开始')) return '会改变该制作项的局部节奏意图，不等同于写入 production 时间线。'
  return '会改变该制作项的执行细节。'
}

function formatTimelineSeconds(value: unknown) {
  const next = Number(value)
  return Number.isFinite(next) ? `${Math.round(next * 10) / 10}s` : undefined
}

function compactFieldChanges(items: Array<ContentSnapshotFieldDiff>): ContentSnapshotFieldDiff[] {
  return items.filter((item) => normalizeContentWorkbenchProposalText(item.before) !== normalizeContentWorkbenchProposalText(item.after))
}

function compactContentParts(parts: Array<unknown>) {
  return parts.map((part) => String(part ?? '').trim()).filter(Boolean).join(' / ')
}
