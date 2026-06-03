import { backendPatch, backendPost, getMCPAPIBaseURL } from '../backendClient'
import { isRecord, stringValue } from '../valueUtils'
import {
  buildApplyRequest,
  getReviewParam,
  isProductionWorkspaceTarget,
  isProjectLayerWorkspaceTarget,
} from './request'

export async function applyWorkspaceReview(args: Record<string, unknown>): Promise<unknown> {
  const review = getReviewParam(args)
  const request = buildApplyRequest(review)
  const response = request.method === 'PATCH'
    ? await backendPatch(request.path, request.payload, args.userId)
    : await backendPost(request.path, request.payload, args.userId)
  return {
    performed: true,
    method: request.method,
    url: `${getMCPAPIBaseURL()}${request.path}`,
    payload: request.payload,
    response,
  }
}

export async function previewApplyWorkspaceReview(args: Record<string, unknown>): Promise<unknown> {
  const review = getReviewParam(args)
  const validation = buildWorkspaceValidation(review)
  if (!supportsBackendWorkspacePreview(review)) {
    return {
      performed: true,
      backendPreviewPerformed: false,
      skippedReason: 'backend apply preview is not required for this workspace kind',
      validation,
      effects: validation.effects,
      saveable: validation.ok,
    }
  }
  const request = buildApplyRequest(review)
  const path = request.path.replace(/\/apply$/, '/apply-preview')
  const response = await backendPost(path, request.payload, args.userId)
  return {
    performed: true,
    backendPreviewPerformed: true,
    method: request.method,
    url: `${getMCPAPIBaseURL()}${path}`,
    payload: request.payload,
    validation,
    effects: validation.effects,
    saveable: validation.ok,
    response,
  }
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

function buildWorkspaceValidation(review: Record<string, unknown>): {
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

function objectKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).sort()
}
