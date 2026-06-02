import { isJSONRecord } from '../../../shared/json/jsonValue.js'
import { isValidAgentProjectId, isValidAgentReferenceId } from '../../../context/runtime/runtimeContext.js'
import {
  type CreateAgentWorkspaceInput,
  type UpdateAgentWorkspaceInput,
} from '../../store/workspaceStore.js'
import { normalizeRuntimeWorkspaceSource } from '../content/workspaceRuntimeContent.js'

export interface RuntimeCreateWorkspaceInput {
  projectId?: unknown
  kind?: unknown
  title?: unknown
  content?: unknown
  source?: unknown
  target?: unknown
  metadata?: unknown
}

export interface RuntimeUpdateWorkspaceInput {
  workspaceId?: unknown
  status?: unknown
  title?: unknown
  content?: unknown
  target?: unknown
  metadata?: unknown
}

export interface RuntimeWorkspaceBackendAuthInput {
  appliedByUserId?: unknown
  backendAuthToken?: unknown
  backendAPIBaseURL?: unknown
}

export interface RuntimeWorkspaceBackendAuthContext {
  userId?: number | string
  backendAuthToken?: string
  backendAPIBaseURL?: string
}

export function buildRuntimeCreateWorkspaceInput(input: RuntimeCreateWorkspaceInput): CreateAgentWorkspaceInput {
  return {
    ...(isValidAgentProjectId(input.projectId) ? { projectId: input.projectId } : {}),
    kind: input.kind,
    title: input.title,
    content: input.content,
    source: normalizeRuntimeWorkspaceSource(input.source),
    target: input.target,
    metadata: input.metadata,
  }
}

export function buildRuntimeUpdateWorkspaceInput(input: RuntimeUpdateWorkspaceInput): {
  workspaceId: string
  update: UpdateAgentWorkspaceInput
} {
  return {
    workspaceId: requireRuntimeWorkspaceId(input.workspaceId, 'update workspace'),
    update: {
      ...(typeof input.title === 'string' ? { title: input.title } : {}),
      ...(typeof input.content === 'string' ? { content: input.content } : {}),
      ...(isJSONRecord(input.target) ? { target: input.target } : {}),
      ...(isJSONRecord(input.metadata) ? { metadata: input.metadata } : {}),
    },
  }
}

export function buildRuntimeWorkspaceBackendAuth(input: RuntimeWorkspaceBackendAuthInput, options: {
  includeAppliedByUserId?: boolean
} = {}): RuntimeWorkspaceBackendAuthContext {
  return {
    ...(options.includeAppliedByUserId && isValidAgentReferenceId(input.appliedByUserId)
      ? { userId: input.appliedByUserId }
      : {}),
    ...(typeof input.backendAuthToken === 'string' ? { backendAuthToken: input.backendAuthToken } : {}),
    ...(typeof input.backendAPIBaseURL === 'string' ? { backendAPIBaseURL: input.backendAPIBaseURL } : {}),
  }
}

export function requireRuntimeWorkspaceId(value: unknown, action: string): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  throw new Error(`${action} requires workspaceId`)
}
