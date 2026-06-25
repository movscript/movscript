import type { ElectronAgentSessionState } from '@/shared/contracts/electronApi'

import {
  agentConversationFocusStorageKey,
  type AgentConversationFocusScope,
} from './agentConversationFocusScope'
import type { AgentConversationRegistryEvent } from './agentConversationRegistryEvents'
import type {
  AgentSessionStore,
  PersistedAgentSessionStore,
} from './agentSessionStoreTypes'

export function normalizePersistedAgentSessionState(value: unknown): PersistedAgentSessionStore | null {
  const stateValue = isRecord(value) && isRecord(value.state) ? value.state : value
  if (!isRecord(stateValue)) return null
  return {
    activeConversationIdsByUser: normalizeStringNullableRecord(stateValue.activeConversationIdsByUser),
    activeConversationIdsByScope: normalizeStringNullableRecord(stateValue.activeConversationIdsByScope),
    conversationsById: normalizeRecordMap(stateValue.conversationsById) as unknown as PersistedAgentSessionStore['conversationsById'],
    workspacesByUser: normalizeNestedRecordMap(stateValue.workspacesByUser) as unknown as PersistedAgentSessionStore['workspacesByUser'],
  }
}

export function mergePersistedAgentSessionState(
  current: AgentSessionStore,
  persisted: ElectronAgentSessionState | PersistedAgentSessionStore,
): Partial<AgentSessionStore> {
  return {
    activeConversationIdsByUser: {
      ...persisted.activeConversationIdsByUser,
      ...current.activeConversationIdsByUser,
    },
    activeConversationIdsByScope: {
      ...(persisted.activeConversationIdsByScope ?? {}),
      ...(current.activeConversationIdsByScope ?? {}),
    },
    conversationsById: {
      ...persisted.conversationsById,
      ...current.conversationsById,
    },
    workspacesByUser: mergeNestedRecordMap(persisted.workspacesByUser, current.workspacesByUser),
  }
}

export function applyRemoteAgentSessionRegistryEvent(
  current: AgentSessionStore,
  event: AgentConversationRegistryEvent,
): Partial<AgentSessionStore> {
  if (!event.snapshot) return {}
  const conversationsById = {
    ...current.conversationsById,
    ...event.snapshot.conversationsById,
  }
  const workspacesByUser = mergeNestedRecordMap(current.workspacesByUser, event.snapshot.workspacesByUser)
  if (event.kind === 'conversation-removed' && event.conversationId) {
    delete conversationsById[event.conversationId]
    if (event.userId && workspacesByUser[event.userId]) {
      workspacesByUser[event.userId] = { ...workspacesByUser[event.userId] }
      delete workspacesByUser[event.userId][event.conversationId]
    }
  }
  return {
    activeConversationIdsByUser: {
      ...current.activeConversationIdsByUser,
      ...event.snapshot.activeConversationIdsByUser,
    },
    activeConversationIdsByScope: {
      ...(current.activeConversationIdsByScope ?? {}),
      ...(event.snapshot.activeConversationIdsByScope ?? {}),
    },
    conversationsById,
    workspacesByUser,
  }
}

export function hasPersistedAgentSessionState(
  state: PersistedAgentSessionStore | ElectronAgentSessionState | null | undefined,
): boolean {
  return Boolean(state && (
    Object.keys(state.activeConversationIdsByUser).length > 0
    || Object.keys(state.activeConversationIdsByScope ?? {}).length > 0
    || Object.keys(state.conversationsById).length > 0
    || Object.keys(state.workspacesByUser).length > 0
  ))
}

export function activeConversationStorePatch(
  state: AgentSessionStore,
  userId: string,
  conversationId: string | null,
  focusScope?: AgentConversationFocusScope,
): Partial<AgentSessionStore> {
  if (focusScope !== undefined) {
    return {
      activeConversationIdsByScope: {
        ...(state.activeConversationIdsByScope ?? {}),
        [agentConversationFocusStorageKey(userId, focusScope)]: conversationId,
      },
    }
  }
  return {
    activeConversationIdsByUser: {
      ...(state.activeConversationIdsByUser ?? {}),
      [userId]: conversationId,
    },
  }
}

export function clearActiveConversationsStorePatch(
  state: AgentSessionStore,
  userId: string,
): Partial<AgentSessionStore> {
  const activeConversationIdsByScope = { ...(state.activeConversationIdsByScope ?? {}) }
  for (const key of Object.keys(activeConversationIdsByScope)) {
    if (key.endsWith(`\u0000${userId}`)) activeConversationIdsByScope[key] = null
  }
  return {
    activeConversationIdsByUser: {
      ...(state.activeConversationIdsByUser ?? {}),
      [userId]: null,
    },
    activeConversationIdsByScope,
  }
}

function mergeNestedRecordMap<T>(
  base: Record<string, Record<string, T>>,
  overlay: Record<string, Record<string, T>>,
): Record<string, Record<string, T>> {
  const output: Record<string, Record<string, T>> = { ...base }
  for (const [key, value] of Object.entries(overlay)) {
    output[key] = {
      ...(output[key] ?? {}),
      ...value,
    }
  }
  return output
}

function normalizeStringNullableRecord(input: unknown): Record<string, string | null> {
  if (!isRecord(input)) return {}
  const output: Record<string, string | null> = {}
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') output[key] = value
    else if (value === null) output[key] = null
  }
  return output
}

function normalizeRecordMap(input: unknown): Record<string, Record<string, unknown>> {
  if (!isRecord(input)) return {}
  const output: Record<string, Record<string, unknown>> = {}
  for (const [key, value] of Object.entries(input)) {
    if (isRecord(value)) output[key] = value
  }
  return output
}

function normalizeNestedRecordMap(input: unknown): Record<string, Record<string, Record<string, unknown>>> {
  if (!isRecord(input)) return {}
  const output: Record<string, Record<string, Record<string, unknown>>> = {}
  for (const [key, value] of Object.entries(input)) {
    const normalized = normalizeRecordMap(value)
    if (Object.keys(normalized).length > 0) output[key] = normalized
  }
  return output
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
