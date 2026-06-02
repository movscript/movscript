import type { JSONValue } from '../../shared/protocol/types.js'
import { isJSONValue, isRecord } from '../../shared/json/jsonValue.js'
import { isValidAgentProjectId, isValidAgentReferenceId } from '../../context/runtime/runtimeContext.js'
import type { AgentWorkspace, AgentWorkspaceStore, AgentWorkspaceTarget } from '../store/workspaceStore.js'

export type ApplyWorkspaceMode = 'preview' | 'apply'

export interface ApplyWorkspaceInput {
  workspaceId?: unknown
  projectId?: unknown
  target?: unknown
  targetEntityType?: unknown
  targetEntityId?: unknown
  targetField?: unknown
  currentValue?: unknown
  proposedValue?: unknown
  appliedByUserId?: unknown
  rejectionReason?: unknown
  mode?: unknown
}

export interface ApplyWorkspaceReview {
  workspaceId: string
  workspaceTitle: string
  workspaceKind: AgentWorkspace['kind']
  target: AgentWorkspaceTarget
  currentValue: JSONValue
  proposedValue: JSONValue
  risk: 'write'
  sideEffect: string
  requiresBackendApply: boolean
}

export interface ApplyWorkspaceResult {
  status: 'preview' | 'applied'
  review: ApplyWorkspaceReview
  workspace: AgentWorkspace
  message: string
}

export function buildApplyWorkspacePreview(store: AgentWorkspaceStore, input: ApplyWorkspaceInput): ApplyWorkspaceResult {
  const workspace = requireWorkspace(store, input.workspaceId)
  const review = buildReview(workspace, input)
  return {
    status: 'preview',
    review,
    workspace,
    message: 'Workspace apply preview created. User approval is required before writing the current workspace to the target.',
  }
}

export function applyWorkspaceAfterApproval(store: AgentWorkspaceStore, input: ApplyWorkspaceInput): ApplyWorkspaceResult {
  const workspace = requireWorkspace(store, input.workspaceId)
  const review = buildReview(workspace, input)
  const applied = markWorkspaceApplied(store, workspace, review, input)
  return {
    status: 'applied',
    review,
    workspace: applied,
    message: 'Workspace apply recorded. The workspace remains editable and can be applied again after further review.',
  }
}

export function markWorkspaceApplied(
  store: AgentWorkspaceStore,
  workspace: AgentWorkspace,
  review: ApplyWorkspaceReview,
  input: ApplyWorkspaceInput,
  metadata: Record<string, JSONValue> = {},
): AgentWorkspace {
  const now = new Date().toISOString()
  return store.updateWorkspace(workspace.id, {
    target: review.target,
    appliedAt: now,
    ...(typeof input.appliedByUserId === 'number' || typeof input.appliedByUserId === 'string'
      ? { appliedByUserId: input.appliedByUserId }
      : {}),
    metadata: {
      ...(isRecord(workspace.metadata) ? workspace.metadata : {}),
      applyReview: review as unknown as JSONValue,
      appliedBy: 'movscript-agent',
      lastApplyStatus: 'applied',
      lastAppliedAt: now,
      backendWritePerformed: false,
      ...metadata,
    },
  })
}

export function rejectWorkspace(store: AgentWorkspaceStore, workspaceId: unknown, reason: unknown): AgentWorkspace {
  const workspace = requireWorkspace(store, workspaceId)
  return store.updateWorkspace(workspace.id, {
    rejectedReason: typeof reason === 'string' ? reason : undefined,
    metadata: {
      ...(isRecord(workspace.metadata) ? workspace.metadata : {}),
      lastReviewStatus: 'rejected',
      ...(typeof reason === 'string' ? { lastRejectionReason: reason } : {}),
    },
  })
}

function buildReview(workspace: AgentWorkspace, input: ApplyWorkspaceInput): ApplyWorkspaceReview {
  const target = normalizeTarget(input.target) ?? inferTarget(workspace, input)
  if (!target.entityType || target.entityId === undefined) {
    throw new Error('apply_workspace requires target entityType and entityId')
  }
  const proposedValue = normalizeJSONValue(input.proposedValue, workspace.content)
  return {
    workspaceId: workspace.id,
    workspaceTitle: workspace.title,
    workspaceKind: workspace.kind,
    target,
    currentValue: normalizeJSONValue(input.currentValue, null),
    proposedValue,
    risk: 'write',
    sideEffect: `Apply current workspace ${workspace.id} to ${target.entityType} ${String(target.entityId)}${target.field ? ` field ${target.field}` : ''}.`,
    requiresBackendApply: true,
  }
}

function inferTarget(workspace: AgentWorkspace, input: ApplyWorkspaceInput): AgentWorkspaceTarget {
  const workspaceTarget = normalizeTarget(workspace.target) ?? {}
  return {
    ...workspaceTarget,
    ...(projectIdValue(input.projectId) !== undefined ? { projectId: projectIdValue(input.projectId) } : {}),
    ...(typeof input.targetEntityType === 'string' && input.targetEntityType.trim() ? { entityType: input.targetEntityType.trim() } : {}),
    ...(isValidAgentReferenceId(input.targetEntityId) ? { entityId: input.targetEntityId } : {}),
    ...(typeof input.targetField === 'string' && input.targetField.trim() ? { field: input.targetField.trim() } : {}),
  }
}

function normalizeTarget(value: unknown): AgentWorkspaceTarget | undefined {
  if (!isRecord(value)) return undefined
  const target: AgentWorkspaceTarget = {
    ...(typeof value.entityType === 'string' && value.entityType.trim() ? { entityType: value.entityType.trim() } : {}),
    ...(isValidAgentReferenceId(value.entityId) ? { entityId: value.entityId } : {}),
    ...(projectIdValue(value.projectId) !== undefined ? { projectId: projectIdValue(value.projectId) } : {}),
    ...(typeof value.field === 'string' && value.field.trim() ? { field: value.field.trim() } : {}),
  }
  return Object.keys(target).length > 0 ? target : undefined
}

function projectIdValue(value: unknown): number | undefined {
  return isValidAgentProjectId(value) ? value : undefined
}

function requireWorkspace(store: AgentWorkspaceStore, workspaceId: unknown): AgentWorkspace {
  if (typeof workspaceId !== 'string' || workspaceId.trim().length === 0) {
    throw new Error('apply_workspace requires workspaceId')
  }
  const workspace = store.getWorkspace(workspaceId.trim())
  if (!workspace) throw new Error(`workspace not found: ${workspaceId}`)
  return workspace
}

function normalizeJSONValue(value: unknown, fallback: JSONValue): JSONValue {
  return isJSONValue(value) ? value : fallback
}
