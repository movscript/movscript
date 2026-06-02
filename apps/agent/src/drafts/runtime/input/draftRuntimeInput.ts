import { isJSONRecord } from '../../../shared/json/jsonValue.js'
import { isValidAgentProjectId, isValidAgentReferenceId } from '../../../context/runtime/runtimeContext.js'
import {
  type CreateAgentDraftInput,
  type UpdateAgentDraftInput,
} from '../../store/draftStore.js'
import { normalizeRuntimeDraftSource } from '../content/draftRuntimeContent.js'

export interface RuntimeCreateDraftInput {
  projectId?: unknown
  kind?: unknown
  title?: unknown
  content?: unknown
  source?: unknown
  target?: unknown
  metadata?: unknown
}

export interface RuntimeUpdateDraftInput {
  draftId?: unknown
  status?: unknown
  title?: unknown
  content?: unknown
  target?: unknown
  metadata?: unknown
}

export interface RuntimeDraftBackendAuthInput {
  appliedByUserId?: unknown
  backendAuthToken?: unknown
  backendAPIBaseURL?: unknown
}

export interface RuntimeDraftBackendAuthContext {
  userId?: number | string
  backendAuthToken?: string
  backendAPIBaseURL?: string
}

export function buildRuntimeCreateDraftInput(input: RuntimeCreateDraftInput): CreateAgentDraftInput {
  return {
    ...(isValidAgentProjectId(input.projectId) ? { projectId: input.projectId } : {}),
    kind: input.kind,
    title: input.title,
    content: input.content,
    source: normalizeRuntimeDraftSource(input.source),
    target: input.target,
    metadata: input.metadata,
  }
}

export function buildRuntimeUpdateDraftInput(input: RuntimeUpdateDraftInput): {
  draftId: string
  update: UpdateAgentDraftInput
} {
  return {
    draftId: requireRuntimeDraftId(input.draftId, 'update draft'),
    update: {
      ...(typeof input.title === 'string' ? { title: input.title } : {}),
      ...(typeof input.content === 'string' ? { content: input.content } : {}),
      ...(isJSONRecord(input.target) ? { target: input.target } : {}),
      ...(isJSONRecord(input.metadata) ? { metadata: input.metadata } : {}),
    },
  }
}

export function buildRuntimeDraftBackendAuth(input: RuntimeDraftBackendAuthInput, options: {
  includeAppliedByUserId?: boolean
} = {}): RuntimeDraftBackendAuthContext {
  return {
    ...(options.includeAppliedByUserId && isValidAgentReferenceId(input.appliedByUserId)
      ? { userId: input.appliedByUserId }
      : {}),
    ...(typeof input.backendAuthToken === 'string' ? { backendAuthToken: input.backendAuthToken } : {}),
    ...(typeof input.backendAPIBaseURL === 'string' ? { backendAPIBaseURL: input.backendAPIBaseURL } : {}),
  }
}

export function requireRuntimeDraftId(value: unknown, action: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  throw new Error(`${action} requires draftId`)
}
