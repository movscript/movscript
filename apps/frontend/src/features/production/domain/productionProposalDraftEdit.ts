import type { AgentDraft } from '@/shared/infrastructure/localAgentClient'
import { PRODUCTION_PROPOSAL_DRAFT_SCHEMA } from '@/features/production/domain/productionProposalDraft'
import {
  parseProductionProposalDraft,
  type ProposalContentUnitNode,
  type ProposalCreativeRefNode,
  type ProposalSceneMomentNode,
  type ProposalSegmentNode,
  type ProposalWritingExpressionNode,
} from '@/features/production/domain/productionProposalReviewModel'

export interface EditableProductionProposalDraftJson extends Record<string, unknown> {
  proposal: {
    segments: ProposalSegmentNode[]
  }
}

export interface ProductionProposalDraftTextEditResult {
  content: string
  error: string
}

export function updateProductionProposalDraftText(
  baseDraft: AgentDraft,
  mutate: (draft: EditableProductionProposalDraftJson) => void,
): ProductionProposalDraftTextEditResult {
  const parsed = parseEditableProductionProposalDraftJson(baseDraft.content)
  if (!parsed) {
    return { content: baseDraft.content, error: '这不是可编辑的 production proposal snapshot 草稿。' }
  }

  mutate(parsed)
  const content = JSON.stringify(parsed, null, 2)
  const validationDraft = { ...baseDraft, content }
  if (!parseProductionProposalDraft(validationDraft)) {
    return { content: baseDraft.content, error: '修改后的草稿无法通过 production proposal schema 校验。' }
  }

  return { content, error: '' }
}

export function productionProposalDraftNodeKey(node: { id?: number; client_id?: string }, fallback: string) {
  if (typeof node.id === 'number' && Number.isFinite(node.id)) return `id:${node.id}`
  if (node.client_id) return `client:${node.client_id}`
  return fallback
}

export function replaceProductionProposalDraftSegment(
  draft: EditableProductionProposalDraftJson,
  targetKey: string,
  nextSegment: ProposalSegmentNode,
) {
  const index = draft.proposal.segments.findIndex((segment, segmentIndex) => (
    productionProposalDraftNodeKey(segment, `segment:${segmentIndex}`) === targetKey
  ))
  if (index < 0) return false
  draft.proposal.segments[index] = {
    ...draft.proposal.segments[index],
    ...withoutUndefined(nextSegment),
    scene_moments: nextSegment.scene_moments ?? draft.proposal.segments[index]?.scene_moments ?? [],
  }
  return true
}

export function removeProductionProposalDraftSegment(
  draft: EditableProductionProposalDraftJson,
  targetKey: string,
) {
  const before = draft.proposal.segments.length
  draft.proposal.segments = draft.proposal.segments.filter((segment, segmentIndex) => (
    productionProposalDraftNodeKey(segment, `segment:${segmentIndex}`) !== targetKey
  ))
  return draft.proposal.segments.length !== before
}

export function appendProductionProposalDraftSegment(
  draft: EditableProductionProposalDraftJson,
  segment: ProposalSegmentNode,
) {
  draft.proposal.segments.push({
    ...segment,
    order: segment.order ?? draft.proposal.segments.length + 1,
    scene_moments: segment.scene_moments ?? [],
  })
}

export function replaceProductionProposalDraftSceneMoment(
  draft: EditableProductionProposalDraftJson,
  segmentKey: string,
  momentKey: string,
  nextMoment: ProposalSceneMomentNode,
) {
  const segment = findSegment(draft, segmentKey)
  if (!segment) return false
  const moments = segment.scene_moments ?? []
  const index = moments.findIndex((moment, momentIndex) => (
    productionProposalDraftNodeKey(moment, `moment:${momentIndex}`) === momentKey
  ))
  if (index < 0) return false
  moments[index] = { ...moments[index], ...withoutUndefined(nextMoment) }
  segment.scene_moments = moments
  return true
}

export function removeProductionProposalDraftSceneMoment(
  draft: EditableProductionProposalDraftJson,
  segmentKey: string,
  momentKey: string,
) {
  const segment = findSegment(draft, segmentKey)
  if (!segment) return false
  const moments = segment.scene_moments ?? []
  const nextMoments = moments.filter((moment, momentIndex) => (
    productionProposalDraftNodeKey(moment, `moment:${momentIndex}`) !== momentKey
  ))
  segment.scene_moments = nextMoments
  return nextMoments.length !== moments.length
}

export function appendProductionProposalDraftSceneMoment(
  draft: EditableProductionProposalDraftJson,
  segmentKey: string,
  moment: ProposalSceneMomentNode,
) {
  const segment = findSegment(draft, segmentKey)
  if (!segment) return false
  const moments = segment.scene_moments ?? []
  moments.push({
    ...moment,
    order: moment.order ?? moments.length + 1,
  })
  segment.scene_moments = moments
  return true
}

export function replaceProductionProposalDraftContentUnit(
  draft: EditableProductionProposalDraftJson,
  segmentKey: string,
  momentKey: string,
  unitKey: string,
  nextUnit: ProposalContentUnitNode,
) {
  const moment = findSceneMoment(draft, segmentKey, momentKey)
  if (!moment) return false
  const units = moment.content_units ?? []
  const index = units.findIndex((unit, unitIndex) => (
    productionProposalDraftNodeKey(unit, `unit:${unitIndex}`) === unitKey
  ))
  if (index < 0) return false
  units[index] = { ...units[index], ...withoutUndefined(nextUnit) }
  moment.content_units = units
  return true
}

export function removeProductionProposalDraftContentUnit(
  draft: EditableProductionProposalDraftJson,
  segmentKey: string,
  momentKey: string,
  unitKey: string,
) {
  const moment = findSceneMoment(draft, segmentKey, momentKey)
  if (!moment) return false
  const units = moment.content_units ?? []
  const nextUnits = units.filter((unit, unitIndex) => (
    productionProposalDraftNodeKey(unit, `unit:${unitIndex}`) !== unitKey
  ))
  moment.content_units = nextUnits
  return nextUnits.length !== units.length
}

export function appendProductionProposalDraftContentUnit(
  draft: EditableProductionProposalDraftJson,
  segmentKey: string,
  momentKey: string,
  unit: ProposalContentUnitNode,
) {
  const moment = findSceneMoment(draft, segmentKey, momentKey)
  if (!moment) return false
  const units = moment.content_units ?? []
  units.push({
    ...unit,
    order: unit.order ?? units.length + 1,
  })
  moment.content_units = units
  return true
}

export function replaceProductionProposalDraftWritingExpression(
  draft: EditableProductionProposalDraftJson,
  segmentKey: string,
  momentKey: string,
  expressionKey: string,
  nextExpression: ProposalWritingExpressionNode,
) {
  const moment = findSceneMoment(draft, segmentKey, momentKey)
  if (!moment) return false
  const expressions = moment.writing_expressions ?? []
  const index = expressions.findIndex((expression, expressionIndex) => (
    productionProposalDraftNodeKey(expression, `expression:${expressionIndex}`) === expressionKey
  ))
  if (index < 0) return false
  expressions[index] = { ...expressions[index], ...withoutUndefined(nextExpression) }
  moment.writing_expressions = expressions
  return true
}

export function removeProductionProposalDraftWritingExpression(
  draft: EditableProductionProposalDraftJson,
  segmentKey: string,
  momentKey: string,
  expressionKey: string,
) {
  const moment = findSceneMoment(draft, segmentKey, momentKey)
  if (!moment) return false
  const expressions = moment.writing_expressions ?? []
  const nextExpressions = expressions.filter((expression, expressionIndex) => (
    productionProposalDraftNodeKey(expression, `expression:${expressionIndex}`) !== expressionKey
  ))
  moment.writing_expressions = nextExpressions
  return nextExpressions.length !== expressions.length
}

export function appendProductionProposalDraftWritingExpression(
  draft: EditableProductionProposalDraftJson,
  segmentKey: string,
  momentKey: string,
  expression: ProposalWritingExpressionNode,
) {
  const moment = findSceneMoment(draft, segmentKey, momentKey)
  if (!moment) return false
  const expressions = moment.writing_expressions ?? []
  expressions.push({
    ...expression,
    order: expression.order ?? expressions.length + 1,
  })
  moment.writing_expressions = expressions
  return true
}

export function appendProductionProposalDraftCreativeReference(
  draft: EditableProductionProposalDraftJson,
  segmentKey: string,
  momentKey: string,
  reference: ProposalCreativeRefNode,
) {
  const moment = findSceneMoment(draft, segmentKey, momentKey)
  if (!moment) return false
  const references = moment.creative_references ?? []
  const nextReferenceKey = productionProposalDraftNodeKey(reference, `reference:${references.length}`)
  const alreadyLinked = references.some((item, index) => (
    productionProposalDraftNodeKey(item, `reference:${index}`) === nextReferenceKey ||
    (reference.id && item.id === reference.id) ||
    (reference.client_id && item.client_id === reference.client_id)
  ))
  if (!alreadyLinked) references.push(reference)
  moment.creative_references = references
  return !alreadyLinked
}

export function removeProductionProposalDraftCreativeReference(
  draft: EditableProductionProposalDraftJson,
  segmentKey: string,
  momentKey: string,
  referenceKey: string,
) {
  const moment = findSceneMoment(draft, segmentKey, momentKey)
  if (!moment) return false
  const references = moment.creative_references ?? []
  const nextReferences = references.filter((reference, referenceIndex) => (
    productionProposalDraftNodeKey(reference, `reference:${referenceIndex}`) !== referenceKey
  ))
  moment.creative_references = nextReferences
  return nextReferences.length !== references.length
}

export function buildProductionProposalDraftClientId(prefix: 'segment' | 'moment' | 'unit' | 'expression') {
  return `proposal_${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function parseEditableProductionProposalDraftJson(content: string): EditableProductionProposalDraftJson | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null
  if (parsed.schema !== PRODUCTION_PROPOSAL_DRAFT_SCHEMA || parsed.mode !== 'snapshot') return null
  if (!isRecord(parsed.proposal)) parsed.proposal = {}
  const proposal = parsed.proposal as Record<string, unknown>
  if (!Array.isArray(proposal.segments)) proposal.segments = []
  return parsed as EditableProductionProposalDraftJson
}

function findSegment(draft: EditableProductionProposalDraftJson, segmentKey: string) {
  return draft.proposal.segments.find((segment, segmentIndex) => (
    productionProposalDraftNodeKey(segment, `segment:${segmentIndex}`) === segmentKey
  ))
}

function findSceneMoment(draft: EditableProductionProposalDraftJson, segmentKey: string, momentKey: string) {
  const segment = findSegment(draft, segmentKey)
  if (!segment) return null
  return (segment.scene_moments ?? []).find((moment, momentIndex) => (
    productionProposalDraftNodeKey(moment, `moment:${momentIndex}`) === momentKey
  )) ?? null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function withoutUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined)) as Partial<T>
}
