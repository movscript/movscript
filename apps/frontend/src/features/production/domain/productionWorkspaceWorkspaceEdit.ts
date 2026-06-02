import type { AgentWorkspace } from '@/shared/infrastructure/localAgentClient'
import { PRODUCTION_WORKSPACE_WORKSPACE_SCHEMA } from '@/features/production/domain/productionWorkspaceWorkspace'
import {
  parseProductionWorkspaceWorkspace,
  type WorkspaceContentUnitNode,
  type WorkspaceCreativeRefNode,
  type WorkspaceSceneMomentNode,
  type WorkspaceSegmentNode,
  type WorkspaceWritingExpressionNode,
} from '@/features/production/domain/productionWorkspaceReviewModel'

export interface EditableProductionWorkspaceWorkspaceJson extends Record<string, unknown> {
  workspace: {
    segments: WorkspaceSegmentNode[]
  }
}

export interface ProductionWorkspaceWorkspaceTextEditResult {
  content: string
  error: string
}

export function updateProductionWorkspaceWorkspaceText(
  baseWorkspace: AgentWorkspace,
  mutate: (workspace: EditableProductionWorkspaceWorkspaceJson) => void,
): ProductionWorkspaceWorkspaceTextEditResult {
  const parsed = parseEditableProductionWorkspaceWorkspaceJson(baseWorkspace.content)
  if (!parsed) {
    return { content: baseWorkspace.content, error: '这不是可编辑的 production workspace snapshot 工作区。' }
  }

  mutate(parsed)
  const content = JSON.stringify(parsed, null, 2)
  const validationWorkspace = { ...baseWorkspace, content }
  if (!parseProductionWorkspaceWorkspace(validationWorkspace)) {
    return { content: baseWorkspace.content, error: '修改后的工作区无法通过 production workspace schema 校验。' }
  }

  return { content, error: '' }
}

export function productionWorkspaceWorkspaceNodeKey(node: { id?: number; client_id?: string }, fallback: string) {
  if (typeof node.id === 'number' && Number.isFinite(node.id)) return `id:${node.id}`
  if (node.client_id) return `client:${node.client_id}`
  return fallback
}

export function replaceProductionWorkspaceWorkspaceSegment(
  workspace: EditableProductionWorkspaceWorkspaceJson,
  targetKey: string,
  nextSegment: WorkspaceSegmentNode,
) {
  const index = workspace.workspace.segments.findIndex((segment, segmentIndex) => (
    productionWorkspaceWorkspaceNodeKey(segment, `segment:${segmentIndex}`) === targetKey
  ))
  if (index < 0) return false
  workspace.workspace.segments[index] = {
    ...workspace.workspace.segments[index],
    ...withoutUndefined(nextSegment),
    scene_moments: nextSegment.scene_moments ?? workspace.workspace.segments[index]?.scene_moments ?? [],
  }
  return true
}

export function removeProductionWorkspaceWorkspaceSegment(
  workspace: EditableProductionWorkspaceWorkspaceJson,
  targetKey: string,
) {
  const before = workspace.workspace.segments.length
  workspace.workspace.segments = workspace.workspace.segments.filter((segment, segmentIndex) => (
    productionWorkspaceWorkspaceNodeKey(segment, `segment:${segmentIndex}`) !== targetKey
  ))
  return workspace.workspace.segments.length !== before
}

export function appendProductionWorkspaceWorkspaceSegment(
  workspace: EditableProductionWorkspaceWorkspaceJson,
  segment: WorkspaceSegmentNode,
) {
  workspace.workspace.segments.push({
    ...segment,
    order: segment.order ?? workspace.workspace.segments.length + 1,
    scene_moments: segment.scene_moments ?? [],
  })
}

export function replaceProductionWorkspaceWorkspaceSceneMoment(
  workspace: EditableProductionWorkspaceWorkspaceJson,
  segmentKey: string,
  momentKey: string,
  nextMoment: WorkspaceSceneMomentNode,
) {
  const segment = findSegment(workspace, segmentKey)
  if (!segment) return false
  const moments = segment.scene_moments ?? []
  const index = moments.findIndex((moment, momentIndex) => (
    productionWorkspaceWorkspaceNodeKey(moment, `moment:${momentIndex}`) === momentKey
  ))
  if (index < 0) return false
  moments[index] = { ...moments[index], ...withoutUndefined(nextMoment) }
  segment.scene_moments = moments
  return true
}

export function removeProductionWorkspaceWorkspaceSceneMoment(
  workspace: EditableProductionWorkspaceWorkspaceJson,
  segmentKey: string,
  momentKey: string,
) {
  const segment = findSegment(workspace, segmentKey)
  if (!segment) return false
  const moments = segment.scene_moments ?? []
  const nextMoments = moments.filter((moment, momentIndex) => (
    productionWorkspaceWorkspaceNodeKey(moment, `moment:${momentIndex}`) !== momentKey
  ))
  segment.scene_moments = nextMoments
  return nextMoments.length !== moments.length
}

export function appendProductionWorkspaceWorkspaceSceneMoment(
  workspace: EditableProductionWorkspaceWorkspaceJson,
  segmentKey: string,
  moment: WorkspaceSceneMomentNode,
) {
  const segment = findSegment(workspace, segmentKey)
  if (!segment) return false
  const moments = segment.scene_moments ?? []
  moments.push({
    ...moment,
    order: moment.order ?? moments.length + 1,
  })
  segment.scene_moments = moments
  return true
}

export function replaceProductionWorkspaceWorkspaceContentUnit(
  workspace: EditableProductionWorkspaceWorkspaceJson,
  segmentKey: string,
  momentKey: string,
  unitKey: string,
  nextUnit: WorkspaceContentUnitNode,
) {
  const moment = findSceneMoment(workspace, segmentKey, momentKey)
  if (!moment) return false
  const units = moment.content_units ?? []
  const index = units.findIndex((unit, unitIndex) => (
    productionWorkspaceWorkspaceNodeKey(unit, `unit:${unitIndex}`) === unitKey
  ))
  if (index < 0) return false
  units[index] = { ...units[index], ...withoutUndefined(nextUnit) }
  moment.content_units = units
  return true
}

export function removeProductionWorkspaceWorkspaceContentUnit(
  workspace: EditableProductionWorkspaceWorkspaceJson,
  segmentKey: string,
  momentKey: string,
  unitKey: string,
) {
  const moment = findSceneMoment(workspace, segmentKey, momentKey)
  if (!moment) return false
  const units = moment.content_units ?? []
  const nextUnits = units.filter((unit, unitIndex) => (
    productionWorkspaceWorkspaceNodeKey(unit, `unit:${unitIndex}`) !== unitKey
  ))
  moment.content_units = nextUnits
  return nextUnits.length !== units.length
}

export function appendProductionWorkspaceWorkspaceContentUnit(
  workspace: EditableProductionWorkspaceWorkspaceJson,
  segmentKey: string,
  momentKey: string,
  unit: WorkspaceContentUnitNode,
) {
  const moment = findSceneMoment(workspace, segmentKey, momentKey)
  if (!moment) return false
  const units = moment.content_units ?? []
  units.push({
    ...unit,
    order: unit.order ?? units.length + 1,
  })
  moment.content_units = units
  return true
}

export function replaceProductionWorkspaceWorkspaceWritingExpression(
  workspace: EditableProductionWorkspaceWorkspaceJson,
  segmentKey: string,
  momentKey: string,
  expressionKey: string,
  nextExpression: WorkspaceWritingExpressionNode,
) {
  const moment = findSceneMoment(workspace, segmentKey, momentKey)
  if (!moment) return false
  const expressions = moment.writing_expressions ?? []
  const index = expressions.findIndex((expression, expressionIndex) => (
    productionWorkspaceWorkspaceNodeKey(expression, `expression:${expressionIndex}`) === expressionKey
  ))
  if (index < 0) return false
  expressions[index] = { ...expressions[index], ...withoutUndefined(nextExpression) }
  moment.writing_expressions = expressions
  return true
}

export function removeProductionWorkspaceWorkspaceWritingExpression(
  workspace: EditableProductionWorkspaceWorkspaceJson,
  segmentKey: string,
  momentKey: string,
  expressionKey: string,
) {
  const moment = findSceneMoment(workspace, segmentKey, momentKey)
  if (!moment) return false
  const expressions = moment.writing_expressions ?? []
  const nextExpressions = expressions.filter((expression, expressionIndex) => (
    productionWorkspaceWorkspaceNodeKey(expression, `expression:${expressionIndex}`) !== expressionKey
  ))
  moment.writing_expressions = nextExpressions
  return nextExpressions.length !== expressions.length
}

export function appendProductionWorkspaceWorkspaceWritingExpression(
  workspace: EditableProductionWorkspaceWorkspaceJson,
  segmentKey: string,
  momentKey: string,
  expression: WorkspaceWritingExpressionNode,
) {
  const moment = findSceneMoment(workspace, segmentKey, momentKey)
  if (!moment) return false
  const expressions = moment.writing_expressions ?? []
  expressions.push({
    ...expression,
    order: expression.order ?? expressions.length + 1,
  })
  moment.writing_expressions = expressions
  return true
}

export function appendProductionWorkspaceWorkspaceCreativeReference(
  workspace: EditableProductionWorkspaceWorkspaceJson,
  segmentKey: string,
  momentKey: string,
  reference: WorkspaceCreativeRefNode,
) {
  const moment = findSceneMoment(workspace, segmentKey, momentKey)
  if (!moment) return false
  const references = moment.creative_references ?? []
  const nextReferenceKey = productionWorkspaceWorkspaceNodeKey(reference, `reference:${references.length}`)
  const alreadyLinked = references.some((item, index) => (
    productionWorkspaceWorkspaceNodeKey(item, `reference:${index}`) === nextReferenceKey ||
    (reference.id && item.id === reference.id) ||
    (reference.client_id && item.client_id === reference.client_id)
  ))
  if (!alreadyLinked) references.push(reference)
  moment.creative_references = references
  return !alreadyLinked
}

export function removeProductionWorkspaceWorkspaceCreativeReference(
  workspace: EditableProductionWorkspaceWorkspaceJson,
  segmentKey: string,
  momentKey: string,
  referenceKey: string,
) {
  const moment = findSceneMoment(workspace, segmentKey, momentKey)
  if (!moment) return false
  const references = moment.creative_references ?? []
  const nextReferences = references.filter((reference, referenceIndex) => (
    productionWorkspaceWorkspaceNodeKey(reference, `reference:${referenceIndex}`) !== referenceKey
  ))
  moment.creative_references = nextReferences
  return nextReferences.length !== references.length
}

export function buildProductionWorkspaceWorkspaceClientId(prefix: 'segment' | 'moment' | 'unit' | 'expression') {
  return `workspace_${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function parseEditableProductionWorkspaceWorkspaceJson(content: string): EditableProductionWorkspaceWorkspaceJson | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null
  if (parsed.schema !== PRODUCTION_WORKSPACE_WORKSPACE_SCHEMA || parsed.mode !== 'snapshot') return null
  if (!isRecord(parsed.workspace)) parsed.workspace = {}
  const workspace = parsed.workspace as Record<string, unknown>
  if (!Array.isArray(workspace.segments)) workspace.segments = []
  return parsed as EditableProductionWorkspaceWorkspaceJson
}

function findSegment(workspace: EditableProductionWorkspaceWorkspaceJson, segmentKey: string) {
  return workspace.workspace.segments.find((segment, segmentIndex) => (
    productionWorkspaceWorkspaceNodeKey(segment, `segment:${segmentIndex}`) === segmentKey
  ))
}

function findSceneMoment(workspace: EditableProductionWorkspaceWorkspaceJson, segmentKey: string, momentKey: string) {
  const segment = findSegment(workspace, segmentKey)
  if (!segment) return null
  return (segment.scene_moments ?? []).find((moment, momentIndex) => (
    productionWorkspaceWorkspaceNodeKey(moment, `moment:${momentIndex}`) === momentKey
  )) ?? null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function withoutUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined)) as Partial<T>
}
