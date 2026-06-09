import type { WorkspaceArtifact } from '@/shared/infrastructure/providerSessionClient'
import { PRODUCTION_WORKSPACE_WORKSPACE_SCHEMA } from '@/features/production/domain/productionWorkspaceWorkspace'
import {
  parseProductionWorkspaceArtifact,
  type WorkspaceContentUnitNode,
  type WorkspaceCreativeRefNode,
  type WorkspaceSceneMomentNode,
  type WorkspaceSegmentNode,
  type WorkspaceExpressionUnitNode,
} from '@/features/production/domain/productionWorkspaceReviewModel'

export interface EditableProductionWorkspaceArtifactJson extends Record<string, unknown> {
  workspace: {
    segments: WorkspaceSegmentNode[]
  }
}

export interface ProductionWorkspaceArtifactTextEditResult {
  content: string
  error: string
}

/** @deprecated Use EditableProductionWorkspaceArtifactJson. */
export type EditableProductionWorkspaceWorkspaceJson = EditableProductionWorkspaceArtifactJson

/** @deprecated Use ProductionWorkspaceArtifactTextEditResult. */
export type ProductionWorkspaceWorkspaceTextEditResult = ProductionWorkspaceArtifactTextEditResult

export function updateProductionWorkspaceArtifactText(
  baseWorkspace: WorkspaceArtifact,
  mutate: (workspace: EditableProductionWorkspaceArtifactJson) => void,
): ProductionWorkspaceArtifactTextEditResult {
  const parsed = parseEditableProductionWorkspaceArtifactJson(baseWorkspace.content)
  if (!parsed) {
    return { content: baseWorkspace.content, error: '这不是可编辑的 production workspace snapshot 工作区。' }
  }

  mutate(parsed)
  const content = JSON.stringify(parsed, null, 2)
  const validationWorkspace = { ...baseWorkspace, content }
  if (!parseProductionWorkspaceArtifact(validationWorkspace)) {
    return { content: baseWorkspace.content, error: '修改后的工作区无法通过 production workspace schema 校验。' }
  }

  return { content, error: '' }
}

export function productionWorkspaceArtifactNodeKey(node: { id?: number; client_id?: string }, fallback: string) {
  if (typeof node.id === 'number' && Number.isFinite(node.id)) return `id:${node.id}`
  if (node.client_id) return `client:${node.client_id}`
  return fallback
}

export function replaceProductionWorkspaceArtifactSegment(
  workspace: EditableProductionWorkspaceArtifactJson,
  targetKey: string,
  nextSegment: WorkspaceSegmentNode,
) {
  const index = workspace.workspace.segments.findIndex((segment, segmentIndex) => (
    productionWorkspaceArtifactNodeKey(segment, `segment:${segmentIndex}`) === targetKey
  ))
  if (index < 0) return false
  workspace.workspace.segments[index] = {
    ...workspace.workspace.segments[index],
    ...withoutUndefined(nextSegment),
    scene_moments: nextSegment.scene_moments ?? workspace.workspace.segments[index]?.scene_moments ?? [],
  }
  return true
}

export function removeProductionWorkspaceArtifactSegment(
  workspace: EditableProductionWorkspaceArtifactJson,
  targetKey: string,
) {
  const before = workspace.workspace.segments.length
  workspace.workspace.segments = workspace.workspace.segments.filter((segment, segmentIndex) => (
    productionWorkspaceArtifactNodeKey(segment, `segment:${segmentIndex}`) !== targetKey
  ))
  return workspace.workspace.segments.length !== before
}

export function appendProductionWorkspaceArtifactSegment(
  workspace: EditableProductionWorkspaceArtifactJson,
  segment: WorkspaceSegmentNode,
) {
  workspace.workspace.segments.push({
    ...segment,
    order: segment.order ?? workspace.workspace.segments.length + 1,
    scene_moments: segment.scene_moments ?? [],
  })
}

export function replaceProductionWorkspaceArtifactSceneMoment(
  workspace: EditableProductionWorkspaceArtifactJson,
  segmentKey: string,
  momentKey: string,
  nextMoment: WorkspaceSceneMomentNode,
) {
  const segment = findSegment(workspace, segmentKey)
  if (!segment) return false
  const moments = segment.scene_moments ?? []
  const index = moments.findIndex((moment, momentIndex) => (
    productionWorkspaceArtifactNodeKey(moment, `moment:${momentIndex}`) === momentKey
  ))
  if (index < 0) return false
  moments[index] = { ...moments[index], ...withoutUndefined(nextMoment) }
  segment.scene_moments = moments
  return true
}

export function removeProductionWorkspaceArtifactSceneMoment(
  workspace: EditableProductionWorkspaceArtifactJson,
  segmentKey: string,
  momentKey: string,
) {
  const segment = findSegment(workspace, segmentKey)
  if (!segment) return false
  const moments = segment.scene_moments ?? []
  const nextMoments = moments.filter((moment, momentIndex) => (
    productionWorkspaceArtifactNodeKey(moment, `moment:${momentIndex}`) !== momentKey
  ))
  segment.scene_moments = nextMoments
  return nextMoments.length !== moments.length
}

export function appendProductionWorkspaceArtifactSceneMoment(
  workspace: EditableProductionWorkspaceArtifactJson,
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

export function replaceProductionWorkspaceArtifactContentUnit(
  workspace: EditableProductionWorkspaceArtifactJson,
  segmentKey: string,
  momentKey: string,
  unitKey: string,
  nextUnit: WorkspaceContentUnitNode,
) {
  const moment = findSceneMoment(workspace, segmentKey, momentKey)
  if (!moment) return false
  const units = moment.content_units ?? []
  const index = units.findIndex((unit, unitIndex) => (
    productionWorkspaceArtifactNodeKey(unit, `unit:${unitIndex}`) === unitKey
  ))
  if (index < 0) return false
  units[index] = { ...units[index], ...withoutUndefined(nextUnit) }
  moment.content_units = units
  return true
}

export function removeProductionWorkspaceArtifactContentUnit(
  workspace: EditableProductionWorkspaceArtifactJson,
  segmentKey: string,
  momentKey: string,
  unitKey: string,
) {
  const moment = findSceneMoment(workspace, segmentKey, momentKey)
  if (!moment) return false
  const units = moment.content_units ?? []
  const nextUnits = units.filter((unit, unitIndex) => (
    productionWorkspaceArtifactNodeKey(unit, `unit:${unitIndex}`) !== unitKey
  ))
  moment.content_units = nextUnits
  return nextUnits.length !== units.length
}

export function appendProductionWorkspaceArtifactContentUnit(
  workspace: EditableProductionWorkspaceArtifactJson,
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

export function replaceProductionWorkspaceArtifactExpressionUnit(
  workspace: EditableProductionWorkspaceArtifactJson,
  segmentKey: string,
  momentKey: string,
  expressionKey: string,
  nextExpression: WorkspaceExpressionUnitNode,
) {
  const moment = findSceneMoment(workspace, segmentKey, momentKey)
  if (!moment) return false
  const expressions = moment.expression_units ?? []
  const index = expressions.findIndex((expression, expressionIndex) => (
    productionWorkspaceArtifactNodeKey(expression, `expression:${expressionIndex}`) === expressionKey
  ))
  if (index < 0) return false
  expressions[index] = { ...expressions[index], ...withoutUndefined(nextExpression) }
  moment.expression_units = expressions
  return true
}

export function removeProductionWorkspaceArtifactExpressionUnit(
  workspace: EditableProductionWorkspaceArtifactJson,
  segmentKey: string,
  momentKey: string,
  expressionKey: string,
) {
  const moment = findSceneMoment(workspace, segmentKey, momentKey)
  if (!moment) return false
  const expressions = moment.expression_units ?? []
  const nextExpressions = expressions.filter((expression, expressionIndex) => (
    productionWorkspaceArtifactNodeKey(expression, `expression:${expressionIndex}`) !== expressionKey
  ))
  moment.expression_units = nextExpressions
  return nextExpressions.length !== expressions.length
}

export function appendProductionWorkspaceArtifactExpressionUnit(
  workspace: EditableProductionWorkspaceArtifactJson,
  segmentKey: string,
  momentKey: string,
  expression: WorkspaceExpressionUnitNode,
) {
  const moment = findSceneMoment(workspace, segmentKey, momentKey)
  if (!moment) return false
  const expressions = moment.expression_units ?? []
  expressions.push({
    ...expression,
    order: expression.order ?? expressions.length + 1,
  })
  moment.expression_units = expressions
  return true
}

export function appendProductionWorkspaceArtifactSetting(
  workspace: EditableProductionWorkspaceArtifactJson,
  segmentKey: string,
  momentKey: string,
  reference: WorkspaceCreativeRefNode,
) {
  const moment = findSceneMoment(workspace, segmentKey, momentKey)
  if (!moment) return false
  const references = moment.settings ?? []
  const nextReferenceKey = productionWorkspaceArtifactNodeKey(reference, `reference:${references.length}`)
  const alreadyLinked = references.some((item, index) => (
    productionWorkspaceArtifactNodeKey(item, `reference:${index}`) === nextReferenceKey ||
    (reference.id && item.id === reference.id) ||
    (reference.client_id && item.client_id === reference.client_id)
  ))
  if (!alreadyLinked) references.push(reference)
  moment.settings = references
  return !alreadyLinked
}

export function removeProductionWorkspaceArtifactSetting(
  workspace: EditableProductionWorkspaceArtifactJson,
  segmentKey: string,
  momentKey: string,
  referenceKey: string,
) {
  const moment = findSceneMoment(workspace, segmentKey, momentKey)
  if (!moment) return false
  const references = moment.settings ?? []
  const nextReferences = references.filter((reference, referenceIndex) => (
    productionWorkspaceArtifactNodeKey(reference, `reference:${referenceIndex}`) !== referenceKey
  ))
  moment.settings = nextReferences
  return nextReferences.length !== references.length
}

export function buildProductionWorkspaceArtifactClientId(prefix: 'segment' | 'moment' | 'unit' | 'expression') {
  return `workspace_${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** @deprecated Use updateProductionWorkspaceArtifactText. */
export const updateProductionWorkspaceWorkspaceText = updateProductionWorkspaceArtifactText
/** @deprecated Use productionWorkspaceArtifactNodeKey. */
export const productionWorkspaceWorkspaceNodeKey = productionWorkspaceArtifactNodeKey
/** @deprecated Use replaceProductionWorkspaceArtifactSegment. */
export const replaceProductionWorkspaceWorkspaceSegment = replaceProductionWorkspaceArtifactSegment
/** @deprecated Use removeProductionWorkspaceArtifactSegment. */
export const removeProductionWorkspaceWorkspaceSegment = removeProductionWorkspaceArtifactSegment
/** @deprecated Use appendProductionWorkspaceArtifactSegment. */
export const appendProductionWorkspaceWorkspaceSegment = appendProductionWorkspaceArtifactSegment
/** @deprecated Use replaceProductionWorkspaceArtifactSceneMoment. */
export const replaceProductionWorkspaceWorkspaceSceneMoment = replaceProductionWorkspaceArtifactSceneMoment
/** @deprecated Use removeProductionWorkspaceArtifactSceneMoment. */
export const removeProductionWorkspaceWorkspaceSceneMoment = removeProductionWorkspaceArtifactSceneMoment
/** @deprecated Use appendProductionWorkspaceArtifactSceneMoment. */
export const appendProductionWorkspaceWorkspaceSceneMoment = appendProductionWorkspaceArtifactSceneMoment
/** @deprecated Use replaceProductionWorkspaceArtifactContentUnit. */
export const replaceProductionWorkspaceWorkspaceContentUnit = replaceProductionWorkspaceArtifactContentUnit
/** @deprecated Use removeProductionWorkspaceArtifactContentUnit. */
export const removeProductionWorkspaceWorkspaceContentUnit = removeProductionWorkspaceArtifactContentUnit
/** @deprecated Use appendProductionWorkspaceArtifactContentUnit. */
export const appendProductionWorkspaceWorkspaceContentUnit = appendProductionWorkspaceArtifactContentUnit
/** @deprecated Use replaceProductionWorkspaceArtifactExpressionUnit. */
export const replaceProductionWorkspaceWorkspaceExpressionUnit = replaceProductionWorkspaceArtifactExpressionUnit
/** @deprecated Use removeProductionWorkspaceArtifactExpressionUnit. */
export const removeProductionWorkspaceWorkspaceExpressionUnit = removeProductionWorkspaceArtifactExpressionUnit
/** @deprecated Use appendProductionWorkspaceArtifactExpressionUnit. */
export const appendProductionWorkspaceWorkspaceExpressionUnit = appendProductionWorkspaceArtifactExpressionUnit
/** @deprecated Use appendProductionWorkspaceArtifactSetting. */
export const appendProductionWorkspaceWorkspaceSetting = appendProductionWorkspaceArtifactSetting
/** @deprecated Use removeProductionWorkspaceArtifactSetting. */
export const removeProductionWorkspaceWorkspaceSetting = removeProductionWorkspaceArtifactSetting
/** @deprecated Use buildProductionWorkspaceArtifactClientId. */
export const buildProductionWorkspaceWorkspaceClientId = buildProductionWorkspaceArtifactClientId

function parseEditableProductionWorkspaceArtifactJson(content: string): EditableProductionWorkspaceArtifactJson | null {
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
  return parsed as EditableProductionWorkspaceArtifactJson
}

function findSegment(workspace: EditableProductionWorkspaceArtifactJson, segmentKey: string) {
  return workspace.workspace.segments.find((segment, segmentIndex) => (
    productionWorkspaceArtifactNodeKey(segment, `segment:${segmentIndex}`) === segmentKey
  ))
}

function findSceneMoment(workspace: EditableProductionWorkspaceArtifactJson, segmentKey: string, momentKey: string) {
  const segment = findSegment(workspace, segmentKey)
  if (!segment) return null
  return (segment.scene_moments ?? []).find((moment, momentIndex) => (
    productionWorkspaceArtifactNodeKey(moment, `moment:${momentIndex}`) === momentKey
  )) ?? null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function withoutUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined)) as Partial<T>
}
