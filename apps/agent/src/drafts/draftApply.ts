import type { JSONValue } from '../types.js'
import { isJSONValue, isRecord } from '../jsonValue.js'
import { isValidAgentProjectId, isValidAgentReferenceId } from '../context/runtimeContext.js'
import type { AgentDraft, AgentDraftStore, AgentDraftTarget } from './draftStore.js'

export type ApplyDraftMode = 'preview' | 'apply'

export interface ApplyDraftInput {
  draftId?: unknown
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

export interface ApplyDraftReview {
  draftId: string
  draftTitle: string
  draftKind: AgentDraft['kind']
  target: AgentDraftTarget
  currentValue: JSONValue
  proposedValue: JSONValue
  risk: 'write'
  sideEffect: string
  requiresBackendApply: boolean
}

export interface ApplyDraftResult {
  status: 'preview' | 'applied'
  review: ApplyDraftReview
  draft: AgentDraft
  message: string
}

export function buildApplyDraftPreview(store: AgentDraftStore, input: ApplyDraftInput): ApplyDraftResult {
  const draft = requireDraft(store, input.draftId)
  const review = buildReview(draft, input)
  return {
    status: 'preview',
    review,
    draft,
    message: 'Draft apply preview created. User approval is required before marking the draft applied.',
  }
}

export function applyDraftAfterApproval(store: AgentDraftStore, input: ApplyDraftInput): ApplyDraftResult {
  const draft = requireDraft(store, input.draftId)
  if (draft.status === 'applied') {
    throw new Error(`draft already applied: ${draft.id}`)
  }
  const review = buildReview(draft, input)
  const applied = markDraftApplied(store, draft, review, input)
  return {
    status: 'applied',
    review,
    draft: applied,
    message: 'Draft marked applied in the local agent lifecycle. Formal backend entity write is not performed by this runtime path yet.',
  }
}

export function markDraftApplied(
  store: AgentDraftStore,
  draft: AgentDraft,
  review: ApplyDraftReview,
  input: ApplyDraftInput,
  metadata: Record<string, JSONValue> = {},
): AgentDraft {
  const now = new Date().toISOString()
  return store.updateDraft(draft.id, {
    status: 'applied',
    target: review.target,
    appliedAt: now,
    ...(typeof input.appliedByUserId === 'number' || typeof input.appliedByUserId === 'string'
      ? { appliedByUserId: input.appliedByUserId }
      : {}),
    metadata: {
      ...(isRecord(draft.metadata) ? draft.metadata : {}),
      applyReview: review as unknown as JSONValue,
      appliedBy: 'movscript-agent',
      backendWritePerformed: false,
      ...metadata,
    },
  })
}

export function rejectDraft(store: AgentDraftStore, draftId: unknown, reason: unknown): AgentDraft {
  const draft = requireDraft(store, draftId)
  return store.updateDraft(draft.id, {
    status: 'rejected',
    rejectedReason: typeof reason === 'string' ? reason : undefined,
  })
}

function buildReview(draft: AgentDraft, input: ApplyDraftInput): ApplyDraftReview {
  const target = normalizeTarget(input.target) ?? inferTarget(draft, input)
  if (!target.entityType || target.entityId === undefined) {
    throw new Error('apply_draft requires target entityType and entityId')
  }
  const proposedValue = normalizeJSONValue(input.proposedValue, draft.content)
  return {
    draftId: draft.id,
    draftTitle: draft.title,
    draftKind: draft.kind,
    target,
    currentValue: normalizeJSONValue(input.currentValue, null),
    proposedValue,
    risk: 'write',
    sideEffect: `Mark draft ${draft.id} as applied for ${target.entityType} ${String(target.entityId)}${target.field ? ` field ${target.field}` : ''}.`,
    requiresBackendApply: true,
  }
}

function inferTarget(draft: AgentDraft, input: ApplyDraftInput): AgentDraftTarget {
  const draftTarget = normalizeTarget(draft.target) ?? {}
  return {
    ...draftTarget,
    ...(projectIdValue(input.projectId) !== undefined ? { projectId: projectIdValue(input.projectId) } : {}),
    ...(typeof input.targetEntityType === 'string' && input.targetEntityType.trim() ? { entityType: input.targetEntityType.trim() } : {}),
    ...(isValidAgentReferenceId(input.targetEntityId) ? { entityId: input.targetEntityId } : {}),
    ...(typeof input.targetField === 'string' && input.targetField.trim() ? { field: input.targetField.trim() } : {}),
  }
}

function normalizeTarget(value: unknown): AgentDraftTarget | undefined {
  if (!isRecord(value)) return undefined
  const target: AgentDraftTarget = {
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

function requireDraft(store: AgentDraftStore, draftId: unknown): AgentDraft {
  if (typeof draftId !== 'string' || draftId.trim().length === 0) {
    throw new Error('apply_draft requires draftId')
  }
  const draft = store.getDraft(draftId.trim())
  if (!draft) throw new Error(`draft not found: ${draftId}`)
  return draft
}

function normalizeJSONValue(value: unknown, fallback: JSONValue): JSONValue {
  return isJSONValue(value) ? value : fallback
}
