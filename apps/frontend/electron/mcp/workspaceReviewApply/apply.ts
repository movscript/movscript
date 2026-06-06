import { backendPost, getMCPAPIBaseURL } from '../backendClient'
import { isRecord, stringValue } from '../valueUtils'
import type { MovScriptWorkspaceKind } from '../../../src/shared/contracts/movscriptWorkspace'
import {
  buildWorkspaceChangeHandoffNavigation,
  WORKSPACE_CHANGE_HANDOFF_SCHEMA,
} from '../../../src/shared/contracts/workspaceChangeHandoff'
import {
  patchWorkspaceModelProjectionMetaState,
  readWorkspaceModelProjectionSnapshot,
  writeWorkspaceModelProjectionSnapshot,
} from '../workspaceModelContract/projection'
import {
  applyWorkspacePath,
  isWorkspacePathRequest,
  previewWorkspacePathApply,
  updateWorkspacePath,
} from './pathWorkspace'
import {
  buildApplyRequest,
  isProductionWorkspaceTarget,
  isProjectLayerWorkspaceTarget,
} from './request'
import { writeWorkspaceReviewFile } from './reviewFiles'

export async function applyWorkspaceReview(args: Record<string, unknown>): Promise<unknown> {
  if (isWorkspacePathRequest(args)) return applyWorkspacePath(args)
  const review = await getWorkspaceReviewParam(args)
  const request = buildApplyRequest(review)
  const validation = buildWorkspaceValidation(review)
  const workspaceKind = stringValue(review.workspaceKind)
  const workspaceId = stringValue(review.workspaceId)
  const workspacePath = isRecord(review.projection) ? stringValue(review.projection.workspacePath) : undefined
  const navigation = buildWorkspaceChangeHandoffNavigation({
    workspaceKind,
    workspaceId,
    workspacePath,
    target: isRecord(review.target) ? review.target : undefined,
    projection: isRecord(review.projection) ? review.projection : undefined,
  })
  const now = new Date().toISOString()
  const projectionMeta = patchWorkspaceModelProjectionMetaState(review.projection, {
    dirty: true,
    lastSubmittedAt: now,
    lastChangeSubmittedAt: now,
    lastSubmitSaveable: validation.ok,
  })
  return {
    performed: true,
    submitted: true,
    changeSubmitted: true,
    materialized: false,
    applyBoundary: 'frontend_review',
    method: request.method,
    plannedUrl: `${getMCPAPIBaseURL()}${request.path}`,
    payload: request.payload,
    validation,
    effects: validation.effects,
    saveable: validation.ok,
    ...(review.projection !== undefined ? { projection: review.projection } : {}),
    changeSubmission: {
      schema: WORKSPACE_CHANGE_HANDOFF_SCHEMA,
      status: 'change_submitted',
      source: 'mcp_workspace_apply',
      createdAt: now,
      workspaceKind,
      workspaceId,
      workspacePath,
      target: review.target,
      projection: review.projection,
      navigation,
    },
    handoff: {
      schema: WORKSPACE_CHANGE_HANDOFF_SCHEMA,
      status: 'change_submitted',
      source: 'mcp_workspace_apply',
      createdAt: now,
      workspacePath,
      navigation,
    },
    ...(projectionMeta ? { projectionMeta } : {}),
  }
}

export async function previewApplyWorkspaceReview(args: Record<string, unknown>): Promise<unknown> {
  if (isWorkspacePathRequest(args)) return previewWorkspacePathApply(args)
  const review = await getWorkspaceReviewParam(args)
  const validation = buildWorkspaceValidation(review)
  if (!supportsBackendWorkspacePreview(review)) {
    const reviewFile = await writeWorkspaceReviewFile({
      status: 'local_preview',
      workspaceKind: stringValue(review.workspaceKind),
      target: review.target,
      projection: review.projection,
      validation,
      effects: validation.effects,
    })
    const projectionMeta = patchWorkspaceModelProjectionMetaState(review.projection, {
      lastPreviewAt: new Date().toISOString(),
      lastReviewPath: reviewFile.path,
      lastPreviewSaveable: validation.ok,
    })
    return {
      performed: true,
      backendPreviewPerformed: false,
      skippedReason: 'backend apply preview is not required for this workspace kind',
      validation,
      effects: validation.effects,
      saveable: validation.ok,
      ...(review.projection !== undefined ? { projection: review.projection } : {}),
      reviewFile,
      ...(projectionMeta ? { projectionMeta } : {}),
    }
  }
  const request = buildApplyRequest(review)
  const path = request.path.replace(/\/apply$/, '/apply-preview')
  const response = await backendPost(path, request.payload, args.userId)
  const reviewFile = await writeWorkspaceReviewFile({
    status: 'previewed',
    workspaceKind: stringValue(review.workspaceKind),
    target: review.target,
    projection: review.projection,
    validation,
    effects: validation.effects,
    request: {
      method: request.method,
      path,
      payload: request.payload,
    },
    response,
  })
  const projectionMeta = patchWorkspaceModelProjectionMetaState(review.projection, {
    lastPreviewAt: new Date().toISOString(),
    lastReviewPath: reviewFile.path,
    lastPreviewSaveable: validation.ok,
  })
  return {
    performed: true,
    backendPreviewPerformed: true,
    method: request.method,
    url: `${getMCPAPIBaseURL()}${path}`,
    payload: request.payload,
    validation,
    effects: validation.effects,
    saveable: validation.ok,
    ...(review.projection !== undefined ? { projection: review.projection } : {}),
    reviewFile,
    ...(projectionMeta ? { projectionMeta } : {}),
    response,
  }
}

export async function updateWorkspaceSnapshot(args: Record<string, unknown>): Promise<unknown> {
  if (isWorkspacePathRequest(args)) return updateWorkspacePath(args)
  const review = await getWorkspaceReviewParam(args)
  const proposedValue = parseProposedValue(review.proposedValue)
  const normalizedReview: Record<string, unknown> = {
    ...review,
    proposedValue,
  }
  const validation = buildWorkspaceValidation(normalizedReview)
  const workspaceKind = normalizeMovScriptWorkspaceKind(stringValue(normalizedReview.workspaceKind))
  const projection = workspaceKind && isRecord(proposedValue)
    ? await writeWorkspaceModelProjectionSnapshot({
        kind: workspaceKind,
        target: isRecord(normalizedReview.target) ? normalizedReview.target : {},
        snapshot: proposedValue,
      })
    : undefined
  return {
    performed: true,
    persisted: !!projection?.materialized,
    persistenceOwner: 'frontend',
    agentWritable: false,
    ...(projection ? { projection } : {}),
    updateKind: 'complete_snapshot',
    review: normalizedReview,
    snapshot: proposedValue,
    validation,
    effects: validation.effects,
    saveable: validation.ok,
    materialize: {
      previewTool: 'workspace_apply_review',
      applyTool: 'workspace_apply',
    },
  }
}

async function getWorkspaceReviewParam(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const input = workspaceReviewInput(args)
  let proposedValue = input.proposedValue ?? input.content ?? input.snapshot
  let workspaceKind = stringValue(input.workspaceKind) ?? stringValue(input.kind)
  let target = isRecord(input.target) ? input.target : {}
  const workspacePath = stringValue(args.workspacePath)
    ?? stringValue(args.workspace_path)
    ?? stringValue(input.workspacePath)
    ?? stringValue(input.workspace_path)
    ?? (isRecord(args.projection) ? stringValue(args.projection.workspacePath) : undefined)
    ?? (isRecord(input.projection) ? stringValue(input.projection.workspacePath) : undefined)
  let projection: unknown = isRecord(input.projection) ? input.projection : undefined
  if (proposedValue === undefined && (workspacePath || workspaceKind)) {
    const projectionRead = await readWorkspaceModelProjectionSnapshot({
      kind: normalizeMovScriptWorkspaceKind(workspaceKind),
      target,
      workspacePath,
    })
    projection = projectionRead.projection
    proposedValue = projectionRead.snapshot
    workspaceKind = workspaceKind ?? stringValue(projectionRead.meta?.workspaceKind)
    target = mergeProjectionMetaTarget(target, projectionRead.meta)
    if (!projectionRead.exists) {
      throw new Error(`workspace projection file was not found${workspacePath ? `: ${workspacePath}` : ''}`)
    }
  }
  if (proposedValue === undefined) {
    throw new Error('review, content, snapshot, proposedValue, or workspacePath is required')
  }
  const parsedValue = parseProposedValue(proposedValue)
  return normalizeWorkspaceReview({
    ...(stringValue(input.workspaceId) ? { workspaceId: stringValue(input.workspaceId) } : {}),
    ...(workspaceKind ? { workspaceKind } : {}),
    target,
    ...(input.currentValue !== undefined ? { currentValue: input.currentValue } : {}),
    ...(projection !== undefined ? { projection } : {}),
    proposedValue: parsedValue,
  })
}

function workspaceReviewInput(args: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(args.review)) return args
  const merged = { ...args.review }
  for (const key of ['workspaceKind', 'kind', 'target', 'content', 'snapshot', 'proposedValue', 'currentValue', 'workspaceId', 'workspacePath', 'workspace_path', 'projection'] as const) {
    if (args[key] !== undefined) merged[key] = args[key]
  }
  return merged
}

function mergeProjectionMetaTarget(target: Record<string, unknown>, meta: unknown): Record<string, unknown> {
  if (!isRecord(meta) || !isRecord(meta.entity)) return target
  const entity = meta.entity
  const entityType = stringValue(entity.type) ?? stringValue(target.entityType)
  const entityId = target.entityId ?? entity.id
  const projectId = target.projectId ?? entity.projectId
  return {
    ...target,
    ...(entityType ? { entityType } : {}),
    ...(entityId !== undefined ? { entityId } : {}),
    ...(projectId !== undefined ? { projectId } : {}),
    ...(entity.productionId !== undefined && target.productionId === undefined ? { productionId: entity.productionId } : {}),
  }
}

function normalizeWorkspaceReview(review: Record<string, unknown>): Record<string, unknown> {
  const workspaceKind = stringValue(review.workspaceKind)
  const proposedValue = parseProposedValue(review.proposedValue)
  return {
    ...review,
    proposedValue,
    target: normalizeWorkspaceReviewTarget(workspaceKind, review.target, proposedValue),
  }
}

function normalizeWorkspaceReviewTarget(kind: string | undefined, targetValue: unknown, proposedValue: unknown): Record<string, unknown> {
  const target = isRecord(targetValue) ? targetValue : {}
  const proposed = isRecord(proposedValue) ? proposedValue : {}
  if (kind === 'setting_workspace' || kind === 'asset_workspace' || kind === 'project_standards_workspace') {
    const projectId = target.projectId ?? proposed.projectId ?? target.entityId
    return {
      ...target,
      entityType: 'project',
      ...(projectId !== undefined ? { entityId: target.entityId ?? projectId, projectId } : {}),
      field: 'workspace',
    }
  }
  if (kind === 'production_workspace') {
    const productionId = target.entityId ?? target.productionId ?? proposed.productionId ?? proposed.production_id
    const projectId = target.projectId ?? proposed.projectId
    return {
      ...target,
      entityType: 'production',
      ...(productionId !== undefined ? { entityId: productionId } : {}),
      ...(projectId !== undefined ? { projectId } : {}),
    }
  }
  return target
}

function supportsBackendWorkspacePreview(review: Record<string, unknown>): boolean {
  const kind = stringValue(review.workspaceKind)
  return kind === 'setting_workspace'
    || kind === 'asset_workspace'
    || kind === 'project_standards_workspace'
    || kind === 'production_workspace'
    || (!kind && (isProjectLayerWorkspaceTarget(review) || isProductionWorkspaceTarget(review)))
}

interface WorkspaceValidationEffect {
  entityType: string
  operation: 'create' | 'update' | 'snapshot' | 'replace'
  id?: string | number
  clientId?: string
  path: string
  fields?: string[]
}

export function buildWorkspaceValidation(review: Record<string, unknown>): {
  ok: boolean
  source: 'frontend_mcp'
  workspaceId?: string
  workspaceKind?: string
  target?: unknown
  effects: WorkspaceValidationEffect[]
  issues: Array<{ path: string; message: string; severity: 'error' | 'warning' }>
} {
  const workspaceKind = stringValue(review.workspaceKind)
  const proposed = parseProposedValue(review.proposedValue)
  const issues: Array<{ path: string; message: string; severity: 'error' | 'warning' }> = []
  if (!isRecord(proposed)) {
    issues.push({ path: '/proposedValue', message: 'workspace content must be a JSON object', severity: 'error' })
  }
  const effects = isRecord(proposed) ? effectsForWorkspace(workspaceKind, proposed) : []
  if (effects.length === 0 && issues.length === 0) {
    issues.push({ path: '/effects', message: 'validation found no concrete workspace effects', severity: 'warning' })
  }
  return {
    ok: !issues.some((issue) => issue.severity === 'error'),
    source: 'frontend_mcp',
    ...(stringValue(review.workspaceId) ? { workspaceId: stringValue(review.workspaceId) } : {}),
    ...(workspaceKind ? { workspaceKind } : {}),
    ...(review.target !== undefined ? { target: review.target } : {}),
    effects,
    issues,
  }
}

function effectsForWorkspace(kind: string | undefined, payload: Record<string, unknown>): WorkspaceValidationEffect[] {
  const workspace = isRecord(payload.workspace) ? payload.workspace : {}
  if (kind === 'project_standards_workspace' || payload.scope === 'project_standards_workspace') {
    return [{
      entityType: 'project',
      operation: 'update',
      path: '/workspace/project_style',
      fields: objectKeys(isRecord(workspace.project_style) ? workspace.project_style : {}),
    }]
  }
  if (kind === 'setting_workspace' || payload.scope === 'setting_workspace') {
    return arrayEffects('creative_reference', '/workspace/creative_references', workspace.creative_references)
  }
  if (kind === 'asset_workspace' || payload.scope === 'asset_workspace') {
    return [
      ...arrayEffects('asset_slot', '/workspace/asset_slots', workspace.asset_slots),
      ...arrayEffects('asset_candidate_plan', '/workspace/candidate_plans', workspace.candidate_plans),
    ]
  }
  if (kind === 'production_workspace' || payload.scope === 'production_workspace') {
    return productionEffects(workspace)
  }
  if (kind === 'content_unit_workspace' || payload.scope === 'content_unit_workspace') {
    return arrayEffects('content_unit', '/workspace/units', workspace.units)
  }
  return [{
    entityType: kind || 'workspace',
    operation: 'replace',
    path: '/workspace',
    fields: objectKeys(workspace),
  }]
}

function productionEffects(workspace: Record<string, unknown>): WorkspaceValidationEffect[] {
  const effects: WorkspaceValidationEffect[] = []
  const segments = Array.isArray(workspace.segments) ? workspace.segments : []
  segments.forEach((segment, segmentIndex) => {
    if (!isRecord(segment)) return
    effects.push(effectFromNode('segment', `/workspace/segments/${segmentIndex}`, segment))
    const moments = Array.isArray(segment.scene_moments) ? segment.scene_moments : []
    moments.forEach((moment, momentIndex) => {
      if (!isRecord(moment)) return
      const momentPath = `/workspace/segments/${segmentIndex}/scene_moments/${momentIndex}`
      effects.push(effectFromNode('scene_moment', momentPath, moment))
      const expressions = Array.isArray(moment.writing_expressions) ? moment.writing_expressions : []
      expressions.forEach((expression, expressionIndex) => {
        if (!isRecord(expression)) return
        effects.push(effectFromNode('writing_expression', `${momentPath}/writing_expressions/${expressionIndex}`, expression))
      })
    })
  })
  return effects
}

function arrayEffects(entityType: string, path: string, value: unknown): WorkspaceValidationEffect[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => isRecord(item) ? [effectFromNode(entityType, `${path}/${index}`, item)] : [])
}

function effectFromNode(entityType: string, path: string, node: Record<string, unknown>): WorkspaceValidationEffect {
  const id = node.id ?? node.ID
  const clientId = stringValue(node.client_id) ?? stringValue(node.clientId)
  return {
    entityType,
    operation: id !== undefined ? 'update' : 'create',
    ...(typeof id === 'string' || typeof id === 'number' ? { id } : {}),
    ...(clientId ? { clientId } : {}),
    path,
    fields: objectKeys(node).filter((key) => !['id', 'ID', 'client_id', 'clientId'].includes(key)),
  }
}

function parseProposedValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function normalizeMovScriptWorkspaceKind(value: string | undefined): MovScriptWorkspaceKind | undefined {
  if (
    value === 'setting_workspace'
    || value === 'asset_workspace'
    || value === 'project_standards_workspace'
    || value === 'production_workspace'
    || value === 'content_unit_workspace'
  ) {
    return value
  }
  return undefined
}

function objectKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).sort()
}
