import type { SemanticEntityPayload } from '@/shared/infrastructure/api/semanticEntities'
import { createElectronMovScriptWorkspaceService } from '@/shared/infrastructure/workspaceDomainRepository'
import type {
  ProductionSceneMomentOrderPatch,
  ProductionSegmentOrderPatch,
} from '@/features/production/domain/productionOrchestrationWorkspaceModel'
import type {
  WorkspaceCreativeRefNode,
  WorkspaceSceneMomentNode,
  WorkspaceSegmentNode,
  WorkspaceWritingExpressionNode,
} from '@/features/production/domain/productionWorkspaceReviewModel'
import type { SettingRecord } from '@/features/production/domain/productionOrchestrationData'
import type {
  ProductionWritingExpressionEditTarget,
  ProductionWritingExpressionSavePayload,
} from '@/features/production/domain/productionWritingExpressions'
import { writingExpressionPayload } from '@/features/production/domain/productionWritingExpressions'

export type ProductionWorkspaceSnapshot = { segments: WorkspaceSegmentNode[] }

export async function saveProductionWorkspaceSnapshot(input: {
  projectId: number
  productionId: number
  snapshot: ProductionWorkspaceSnapshot
}): Promise<ProductionWorkspaceSnapshot> {
  const service = createElectronMovScriptWorkspaceService({ projectId: input.projectId })
  await service.saveProductionSnapshot({
    projectId: input.projectId,
    productionId: input.productionId,
    snapshot: input.snapshot,
  })
  return input.snapshot
}

export async function saveProductionSegmentWorkspaceEdit(input: {
  projectId: number
  productionId: number
  currentSnapshot: ProductionWorkspaceSnapshot
  segmentId: number
  payload: SemanticEntityPayload
}): Promise<ProductionWorkspaceSnapshot> {
  const snapshot = cloneProductionWorkspaceSnapshot(input.currentSnapshot)
  const segment = snapshot.segments.find((item) => item.id === input.segmentId)
  if (!segment) throw new Error('未找到编排段')
  Object.assign(segment, productionSegmentPayloadNode(input.payload))
  return saveProductionWorkspaceSnapshot({ ...input, snapshot })
}

export async function deleteProductionSegmentWorkspaceEdit(input: {
  projectId: number
  productionId: number
  currentSnapshot: ProductionWorkspaceSnapshot
  segmentId: number
}): Promise<ProductionWorkspaceSnapshot> {
  const snapshot = cloneProductionWorkspaceSnapshot(input.currentSnapshot)
  const segment = snapshot.segments.find((item) => item.id === input.segmentId)
  if (!segment) throw new Error('未找到编排段')
  segment.__delete = true
  return saveProductionWorkspaceSnapshot({ ...input, snapshot })
}

export async function saveProductionSceneMomentWorkspaceEdit(input: {
  projectId: number
  productionId: number
  currentSnapshot: ProductionWorkspaceSnapshot
  momentId: number
  payload: SemanticEntityPayload
}): Promise<ProductionWorkspaceSnapshot> {
  const snapshot = cloneProductionWorkspaceSnapshot(input.currentSnapshot)
  const moment = findSceneMomentNode(snapshot, input.momentId)
  if (!moment) throw new Error('未找到情节')
  Object.assign(moment, productionSceneMomentPayloadNode(input.payload))
  return saveProductionWorkspaceSnapshot({ ...input, snapshot })
}

export async function deleteProductionSceneMomentWorkspaceEdit(input: {
  projectId: number
  productionId: number
  currentSnapshot: ProductionWorkspaceSnapshot
  momentId: number
}): Promise<ProductionWorkspaceSnapshot> {
  const snapshot = cloneProductionWorkspaceSnapshot(input.currentSnapshot)
  const moment = findSceneMomentNode(snapshot, input.momentId)
  if (!moment) throw new Error('未找到情节')
  moment.__delete = true
  return saveProductionWorkspaceSnapshot({ ...input, snapshot })
}

export async function saveProductionSegmentOrderWorkspaceEdit(input: {
  projectId: number
  productionId: number
  currentSnapshot: ProductionWorkspaceSnapshot
  patches: ProductionSegmentOrderPatch[]
}): Promise<ProductionWorkspaceSnapshot> {
  const snapshot = cloneProductionWorkspaceSnapshot(input.currentSnapshot)
  const orderBySegmentId = new Map(input.patches.map((patch) => [patch.segmentId, patch.payload.order]))
  snapshot.segments = snapshot.segments
    .map((segment) => orderBySegmentId.has(segment.id ?? -1) ? { ...segment, order: orderBySegmentId.get(segment.id ?? -1) } : segment)
    .sort(workspaceNodeOrder)
  return saveProductionWorkspaceSnapshot({ ...input, snapshot })
}

export async function saveProductionSceneMomentOrderWorkspaceEdit(input: {
  projectId: number
  productionId: number
  currentSnapshot: ProductionWorkspaceSnapshot
  patches: ProductionSceneMomentOrderPatch[]
}): Promise<ProductionWorkspaceSnapshot> {
  const snapshot = cloneProductionWorkspaceSnapshot(input.currentSnapshot)
  const movedMoments = new Map<number, WorkspaceSceneMomentNode>()
  const targetSegmentByMomentId = new Map<number, number>()
  const orderByMomentId = new Map<number, number>()

  for (const patch of input.patches) {
    orderByMomentId.set(patch.momentId, patch.payload.order)
    if (patch.payload.segment_id) targetSegmentByMomentId.set(patch.momentId, patch.payload.segment_id)
  }

  for (const segment of snapshot.segments) {
    const nextMoments: WorkspaceSceneMomentNode[] = []
    for (const moment of segment.scene_moments ?? []) {
      const momentId = moment.id ?? 0
      const nextMoment = orderByMomentId.has(momentId) ? { ...moment, order: orderByMomentId.get(momentId) } : moment
      if (targetSegmentByMomentId.has(momentId) && targetSegmentByMomentId.get(momentId) !== segment.id) {
        movedMoments.set(momentId, nextMoment)
        continue
      }
      nextMoments.push(nextMoment)
    }
    segment.scene_moments = nextMoments.sort(workspaceNodeOrder)
  }

  for (const [momentId, targetSegmentId] of targetSegmentByMomentId.entries()) {
    const targetSegment = snapshot.segments.find((segment) => segment.id === targetSegmentId)
    const moved = movedMoments.get(momentId)
    if (!targetSegment || !moved) continue
    targetSegment.scene_moments = [...(targetSegment.scene_moments ?? []), moved].sort(workspaceNodeOrder)
  }

  return saveProductionWorkspaceSnapshot({ ...input, snapshot })
}

export async function saveProductionWritingExpressionWorkspaceEdit(input: {
  projectId: number
  productionId: number
  currentSnapshot: ProductionWorkspaceSnapshot
  target: ProductionWritingExpressionEditTarget
  payload: ProductionWritingExpressionSavePayload
}): Promise<ProductionWorkspaceSnapshot> {
  const snapshot = cloneProductionWorkspaceSnapshot(input.currentSnapshot)
  const entityPayload = writingExpressionPayload(input.target.kind === 'fallback'
    ? {
      ...input.payload,
      scene_moment_id: input.target.sceneMomentId,
      script_block_id: input.target.scriptBlockId ?? input.payload.script_block_id ?? null,
      order: input.target.order,
    }
    : input.payload)
  const nextExpression = productionWritingExpressionPayloadNode(entityPayload)
  if (input.target.kind === 'writingExpressions') {
    const existing = findWritingExpressionNode(snapshot, input.target.id)
    if (!existing) throw new Error('未找到表达条目')
    Object.assign(existing, nextExpression)
  } else {
    const moment = findSceneMomentNode(snapshot, input.target.sceneMomentId)
    if (!moment) throw new Error('未找到情节')
    const expressions = moment.writing_expressions ?? []
    expressions.push({
      ...nextExpression,
      client_id: `writing_expression_${input.target.id}`,
      order: nextExpression.order ?? expressions.length + 1,
    })
    moment.writing_expressions = expressions.sort(workspaceNodeOrder)
  }
  return saveProductionWorkspaceSnapshot({ ...input, snapshot })
}

export async function createProductionWritingExpressionWorkspaceEdit(input: {
  projectId: number
  productionId: number
  currentSnapshot: ProductionWorkspaceSnapshot
  momentId: number
  order: number
  scriptBlockId?: number | null
}): Promise<ProductionWorkspaceSnapshot> {
  const snapshot = cloneProductionWorkspaceSnapshot(input.currentSnapshot)
  const moment = findSceneMomentNode(snapshot, input.momentId)
  if (!moment) throw new Error('未找到情节')
  const expressions = moment.writing_expressions ?? []
  expressions.push({
    client_id: `writing_expression_local_${Date.now()}`,
    kind: 'dialogue',
    speaker: '',
    text: '',
    note: '',
    intent: '',
    order: input.order,
    script_block_id: input.scriptBlockId ?? null,
  })
  moment.writing_expressions = expressions.sort(workspaceNodeOrder)
  return saveProductionWorkspaceSnapshot({ ...input, snapshot })
}

export async function deleteProductionWritingExpressionWorkspaceEdit(input: {
  projectId: number
  productionId: number
  currentSnapshot: ProductionWorkspaceSnapshot
  expressionId: number
}): Promise<ProductionWorkspaceSnapshot> {
  const snapshot = cloneProductionWorkspaceSnapshot(input.currentSnapshot)
  const expression = findWritingExpressionNode(snapshot, input.expressionId)
  if (!expression) throw new Error('未找到表达条目')
  expression.__delete = true
  return saveProductionWorkspaceSnapshot({ ...input, snapshot })
}

export async function linkProductionSceneMomentReferenceWorkspaceEdit(input: {
  projectId: number
  productionId: number
  currentSnapshot: ProductionWorkspaceSnapshot
  momentId: number
  reference: SettingRecord
  role: string
}): Promise<ProductionWorkspaceSnapshot> {
  const snapshot = cloneProductionWorkspaceSnapshot(input.currentSnapshot)
  const moment = findSceneMomentNode(snapshot, input.momentId)
  if (!moment) throw new Error('未找到情节')
  const references = moment.settings ?? []
  const existing = references.find((reference) => reference.id === input.reference.ID)
  if (existing) {
    Object.assign(existing, productionSettingNode(input.reference, input.role))
    delete existing.__delete
  } else {
    references.push(productionSettingNode(input.reference, input.role))
  }
  moment.settings = references.sort(workspaceNodeOrder)
  return saveProductionWorkspaceSnapshot({ ...input, snapshot })
}

export async function unlinkProductionSceneMomentReferenceWorkspaceEdit(input: {
  projectId: number
  productionId: number
  currentSnapshot: ProductionWorkspaceSnapshot
  momentId: number
  referenceId: number
}): Promise<ProductionWorkspaceSnapshot> {
  const snapshot = cloneProductionWorkspaceSnapshot(input.currentSnapshot)
  const moment = findSceneMomentNode(snapshot, input.momentId)
  if (!moment) throw new Error('未找到情节')
  const reference = (moment.settings ?? []).find((item) => item.id === input.referenceId)
  if (!reference) throw new Error('未找到情节设定')
  reference.__delete = true
  return saveProductionWorkspaceSnapshot({ ...input, snapshot })
}

function cloneProductionWorkspaceSnapshot(snapshot: ProductionWorkspaceSnapshot): ProductionWorkspaceSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as ProductionWorkspaceSnapshot
}

function findSceneMomentNode(snapshot: ProductionWorkspaceSnapshot, momentId: number): WorkspaceSceneMomentNode | null {
  for (const segment of snapshot.segments) {
    const moment = (segment.scene_moments ?? []).find((item) => item.id === momentId)
    if (moment) return moment
  }
  return null
}

function findWritingExpressionNode(snapshot: ProductionWorkspaceSnapshot, expressionId: number): WorkspaceWritingExpressionNode | null {
  for (const segment of snapshot.segments) {
    for (const moment of segment.scene_moments ?? []) {
      const expression = (moment.writing_expressions ?? []).find((item) => item.id === expressionId)
      if (expression) return expression
    }
  }
  return null
}

function productionSegmentPayloadNode(payload: SemanticEntityPayload): Partial<WorkspaceSegmentNode> {
  return pruneUndefined({
    title: stringValue(payload.title),
    kind: stringValue(payload.kind),
    summary: stringValue(payload.summary ?? payload.content),
    order: positiveNumber(payload.order),
    script_block_id: nullablePositiveNumber(payload.script_block_id),
  })
}

function productionSceneMomentPayloadNode(payload: SemanticEntityPayload): Partial<WorkspaceSceneMomentNode> {
  return pruneUndefined({
    title: stringValue(payload.title),
    scene_code: stringValue(payload.scene_code),
    time_text: stringValue(payload.time_text),
    location_text: stringValue(payload.location_text),
    condition_text: stringValue(payload.condition_text),
    action_text: stringValue(payload.action_text),
    mood: stringValue(payload.mood),
    description: stringValue(payload.description),
    order: positiveNumber(payload.order),
    script_block_id: nullablePositiveNumber(payload.script_block_id),
  })
}

function productionWritingExpressionPayloadNode(payload: SemanticEntityPayload): WorkspaceWritingExpressionNode {
  return pruneUndefined({
    kind: stringValue(payload.kind) ?? 'dialogue',
    speaker: stringValue(payload.speaker) ?? '',
    text: stringValue(payload.text) ?? '',
    note: stringValue(payload.note) ?? '',
    intent: stringValue(payload.intent) ?? '',
    order: positiveNumber(payload.order),
    script_block_id: nullablePositiveNumber(payload.script_block_id),
  })
}

function productionSettingNode(reference: SettingRecord, role: string): WorkspaceCreativeRefNode {
  return pruneUndefined({
    id: reference.ID,
    name: stringValue(reference.name) ?? stringValue(reference.title),
    kind: stringValue(reference.kind),
    role,
    source_label: '当前项目',
  })
}

function workspaceNodeOrder<T extends { id?: number; order?: number }>(left: T, right: T): number {
  return (positiveNumber(left.order) ?? positiveNumber(left.id) ?? 0) - (positiveNumber(right.order) ?? positiveNumber(right.id) ?? 0)
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function positiveNumber(value: unknown): number | undefined {
  const next = Number(value)
  return Number.isFinite(next) && next > 0 ? next : undefined
}

function nullablePositiveNumber(value: unknown): number | null | undefined {
  if (value === null) return null
  return positiveNumber(value)
}
