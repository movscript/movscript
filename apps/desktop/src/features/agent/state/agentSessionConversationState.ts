import {
  EMPTY_CONVERSATION_WORKSPACE,
  compactRun,
  defaultConversationRuntimeState,
} from '@/features/agent/state/agentSessionRuntimeModel'
import type { AgentSessionStore } from '@/features/agent/state/agentSessionStoreTypes'
import {
  agentConversationFocusStorageKey,
  type AgentConversationFocusScope,
} from '@/features/agent/state/agentConversationFocusScope'
import {
  activeAgentConversationIdForUser, agentConversationIdForRegistryInput, removeAgentConversationRegistryRecord, setAgentConversationRegistryOpen, upsertAgentConversationRegistryRecord, } from '@movscript/core/agent'
import type { AgentRun } from '@movscript/agent-protocol'

type AgentSessionConversationState = Pick<
  AgentSessionStore,
  | 'activeConversationIdsByUser'
  | 'activeConversationIdsByScope'
  | 'conversationsById'
  | 'conversationRuntimeStates'
  | 'conversationThreadBindings'
  | 'pageTasks'
  | 'workspacesByUser'
>

export function activeConversationIdForUser(
  state: Pick<AgentSessionStore, 'activeConversationIdsByUser' | 'activeConversationIdsByScope'>,
  userId: string,
  focusScope?: AgentConversationFocusScope,
): string | null {
  if (focusScope !== undefined) {
    return state.activeConversationIdsByScope[agentConversationFocusStorageKey(userId, focusScope)] ?? null
  }
  return activeAgentConversationIdForUser(state, userId)
}

export function setAgentSessionConversationOpenState(
  state: AgentSessionConversationState,
  input: { conversationId: string; open: boolean; userId: string; focusScope?: AgentConversationFocusScope },
): Partial<AgentSessionStore> {
  return {
    conversationsById: setAgentConversationRegistryOpen(state.conversationsById, input.conversationId, input.open),
    ...activeConversationPatchForOpenState(state, input),
  }
}

export function createProviderSessionConversationState(
  state: AgentSessionConversationState,
  userId: string,
  input: Parameters<AgentSessionStore['createProviderSessionConversation']>[1],
): { conversationId: string; patch: Partial<AgentSessionStore> | null } {
  const title = input.title?.trim()
  const threadId = input.threadId.trim()
  const providerSessionTreeId = providerSessionTreeIdForConversationInput(input)
  const conversationInput = {
    userId,
    providerThreadId: threadId,
    ...(providerSessionTreeId ? { providerSessionId: providerSessionTreeId } : {}),
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.providerId?.trim() ? { providerId: input.providerId.trim() } : {}),
    ...(input.providerInstanceId?.trim() ? { providerInstanceId: input.providerInstanceId.trim() } : {}),
    ...(input.providerProtocol?.trim() ? { providerProtocol: input.providerProtocol } : {}),
    ...(input.providerThreadCwd?.trim() ? { providerThreadCwd: input.providerThreadCwd.trim() } : {}),
    ...(input.workspaceContext ? { workspaceContext: input.workspaceContext } : {}),
    ...(typeof input.projectId === 'number' ? { projectId: input.projectId } : {}),
    ...(title ? { title } : {}),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    open: true,
    archived: false,
  }
  const conversationId = agentConversationIdForRegistryInput(conversationInput)
  if (!conversationId) return { conversationId: activeConversationIdForUser(state, userId, input.focusScope) ?? '', patch: null }
  return {
    conversationId,
    patch: {
      ...activeConversationPatch(state, userId, conversationId, input.focusScope),
      conversationsById: upsertAgentConversationRegistryRecord(state.conversationsById, conversationInput),
      ...(threadId
        ? {
            conversationThreadBindings: {
              ...state.conversationThreadBindings,
              [conversationId]: {
                ...(state.conversationThreadBindings[conversationId] ?? {}),
                conversationId,
                providerThreadId: threadId,
                ...(providerSessionTreeId ? { providerSessionTreeId } : {}),
                updatedAt: Date.now(),
              },
            },
          }
        : {}),
    },
  }
}

function providerSessionTreeIdForConversationInput(input: { providerSessionTreeId?: string; sessionId?: string }): string | undefined {
  return input.providerSessionTreeId?.trim() || input.sessionId?.trim() || undefined
}

export function removeProviderSessionConversationState(
  state: AgentSessionConversationState,
  input: { conversationId: string; userId: string },
): Partial<AgentSessionStore> {
  const workspacesByUser = { ...state.workspacesByUser }
  const conversationsById = removeAgentConversationRegistryRecord(state.conversationsById, input.conversationId)
  const conversationThreadBindings = { ...state.conversationThreadBindings }
  const conversationRuntimeStates = { ...state.conversationRuntimeStates }
  delete conversationThreadBindings[input.conversationId]
  delete conversationRuntimeStates[input.conversationId]
  if (workspacesByUser[input.userId]?.[input.conversationId]) {
    workspacesByUser[input.userId] = { ...workspacesByUser[input.userId] }
    delete workspacesByUser[input.userId][input.conversationId]
  }
  return {
    ...removeActiveConversationReferences(state, input),
    conversationsById,
    conversationThreadBindings,
    conversationRuntimeStates,
    workspacesByUser,
    pageTasks: Object.fromEntries(
      Object.entries(state.pageTasks).filter(([, task]) => task.conversationId !== input.conversationId),
    ),
  }
}

function activeConversationPatch(
  state: AgentSessionConversationState,
  userId: string,
  conversationId: string | null,
  focusScope?: AgentConversationFocusScope,
): Pick<AgentSessionStore, 'activeConversationIdsByUser'> | Pick<AgentSessionStore, 'activeConversationIdsByScope'> {
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

function activeConversationPatchForOpenState(
  state: AgentSessionConversationState,
  input: { conversationId: string; open: boolean; userId: string; focusScope?: AgentConversationFocusScope },
): Partial<Pick<AgentSessionStore, 'activeConversationIdsByUser' | 'activeConversationIdsByScope'>> {
  if (input.focusScope !== undefined) {
    const current = activeConversationIdForUser(state, input.userId, input.focusScope)
    return {
      activeConversationIdsByScope: {
        ...(state.activeConversationIdsByScope ?? {}),
        [agentConversationFocusStorageKey(input.userId, input.focusScope)]: !input.open && current === input.conversationId ? null : current,
      },
    }
  }
  const current = activeConversationIdForUser(state, input.userId)
  return {
    activeConversationIdsByUser: {
      ...(state.activeConversationIdsByUser ?? {}),
      [input.userId]: !input.open && current === input.conversationId ? null : current,
    },
  }
}

function removeActiveConversationReferences(
  state: AgentSessionConversationState,
  input: { conversationId: string; userId: string },
): Partial<Pick<AgentSessionStore, 'activeConversationIdsByUser' | 'activeConversationIdsByScope'>> {
  const activeConversationIdsByUser = {
    ...(state.activeConversationIdsByUser ?? {}),
    [input.userId]: activeConversationIdForUser(state, input.userId) === input.conversationId ? null : activeConversationIdForUser(state, input.userId),
  }
  const activeConversationIdsByScope = { ...(state.activeConversationIdsByScope ?? {}) }
  for (const [key, value] of Object.entries(activeConversationIdsByScope)) {
    if (value === input.conversationId) activeConversationIdsByScope[key] = null
  }
  return {
    activeConversationIdsByUser,
    activeConversationIdsByScope,
  }
}

export function updateConversationWorkspaceState(
  state: AgentSessionConversationState,
  input: { conversationId: string; patch: Parameters<AgentSessionStore['updateConversationWorkspace']>[2]; userId: string },
): Partial<AgentSessionStore> {
  const current = state.workspacesByUser[input.userId]?.[input.conversationId] ?? EMPTY_CONVERSATION_WORKSPACE
  return {
    workspacesByUser: {
      ...state.workspacesByUser,
      [input.userId]: {
        ...(state.workspacesByUser[input.userId] ?? {}),
        [input.conversationId]: {
          ...current,
          ...input.patch,
        },
      },
    },
  }
}

export function clearConversationWorkspaceState(
  state: AgentSessionConversationState,
  input: { conversationId: string; userId: string },
): Partial<AgentSessionStore> {
  if (!state.workspacesByUser[input.userId]?.[input.conversationId]) return {}
  const userWorkspaces = { ...state.workspacesByUser[input.userId] }
  const workspaceContext = userWorkspaces[input.conversationId]?.workspaceContext
  if (workspaceContext) {
    userWorkspaces[input.conversationId] = {
      input: '',
      attachments: [],
      workspaceContext,
    }
  } else {
    delete userWorkspaces[input.conversationId]
  }
  return {
    workspacesByUser: {
      ...state.workspacesByUser,
      [input.userId]: userWorkspaces,
    },
  }
}

export function bindConversationToProviderThreadState(
  state: AgentSessionConversationState,
  input: Parameters<AgentSessionStore['bindConversationToProviderThread']>[0],
): Partial<AgentSessionStore> {
  const conversationId = input.conversationId
  const providerThreadId = input.providerThreadId.trim()
  if (!conversationId || !providerThreadId) return {}
  const providerSessionTreeId = input.providerSessionTreeId?.trim()
  const now = input.updatedAt ?? Date.now()
  return {
    conversationsById: upsertAgentConversationRegistryRecord(state.conversationsById, {
      id: conversationId,
      userId: state.conversationsById[conversationId]?.userId ?? 'anonymous',
      ...(input.provider ? { provider: input.provider } : {}),
      ...(input.providerId ? { providerId: input.providerId } : {}),
      ...(input.providerInstanceId ? { providerInstanceId: input.providerInstanceId } : {}),
      providerThreadId,
      ...(providerSessionTreeId ? { providerSessionId: providerSessionTreeId } : {}),
      ...(input.providerThreadCwd ? { providerThreadCwd: input.providerThreadCwd } : {}),
      ...(input.updatedAt !== undefined ? { updatedAt: input.updatedAt } : {}),
    }),
    conversationThreadBindings: {
      ...state.conversationThreadBindings,
      [conversationId]: {
        ...(state.conversationThreadBindings[conversationId] ?? {}),
        ...input,
        conversationId,
        providerThreadId,
        ...(providerSessionTreeId ? { providerSessionTreeId } : {}),
        updatedAt: now,
      },
    },
  }
}

export function updateConversationRuntimeStatePatch(
  state: AgentSessionConversationState,
  input: { conversationId: string; patch: Parameters<AgentSessionStore['updateConversationRuntimeState']>[1] },
): Partial<AgentSessionStore> {
  const now = Date.now()
  return {
    conversationsById: state.conversationsById[input.conversationId]
      ? {
          ...state.conversationsById,
          [input.conversationId]: {
            ...state.conversationsById[input.conversationId],
            ...(input.patch.status !== undefined ? { status: input.patch.status } : {}),
            ...(input.patch.activeRunId ? { activeRunId: input.patch.activeRunId } : {}),
            updatedAt: now,
          },
        }
      : state.conversationsById,
    conversationRuntimeStates: {
      ...state.conversationRuntimeStates,
      [input.conversationId]: {
        ...defaultConversationRuntimeState(input.conversationId),
        ...(state.conversationRuntimeStates[input.conversationId] ?? {}),
        ...input.patch,
        updatedAt: now,
      },
    },
  }
}

export function setConversationRunState(
  state: AgentSessionConversationState,
  input: { conversationId: string; patch: Parameters<AgentSessionStore['setConversationRun']>[2]; run: AgentRun },
): Partial<AgentSessionStore> {
  const { providerSessionTreeId: patchProviderSessionTreeId, ...runtimePatch } = input.patch ?? {}
  const providerSessionTreeId = patchProviderSessionTreeId ?? input.run.sessionId ?? state.conversationThreadBindings[input.conversationId]?.providerSessionTreeId
  const now = Date.now()
  return {
    conversationsById: state.conversationsById[input.conversationId]
      ? {
          ...state.conversationsById,
          [input.conversationId]: {
            ...state.conversationsById[input.conversationId],
            providerThreadId: input.run.threadId || state.conversationsById[input.conversationId].providerThreadId,
            ...(providerSessionTreeId ? { providerSessionId: providerSessionTreeId } : {}),
            activeRunId: input.run.id,
            lastRunId: input.run.id,
            status: input.run.status,
            updatedAt: now,
          },
        }
      : state.conversationsById,
    conversationThreadBindings: input.run.threadId
      ? {
          ...state.conversationThreadBindings,
          [input.conversationId]: {
            ...(state.conversationThreadBindings[input.conversationId] ?? {}),
            conversationId: input.conversationId,
            providerThreadId: input.run.threadId,
            ...(providerSessionTreeId ? { providerSessionTreeId } : {}),
            updatedAt: now,
          },
        }
      : state.conversationThreadBindings,
    conversationRuntimeStates: {
      ...state.conversationRuntimeStates,
      [input.conversationId]: {
        ...defaultConversationRuntimeState(input.conversationId),
        ...(state.conversationRuntimeStates[input.conversationId] ?? {}),
        ...runtimePatch,
        run: compactRun(input.run) as AgentRun,
        activeRunId: input.run.id,
        status: input.run.status,
        updatedAt: now,
      },
    },
  }
}
