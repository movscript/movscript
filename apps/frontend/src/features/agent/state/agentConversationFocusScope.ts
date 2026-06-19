export type AgentConversationFocusScope = string

export const DEFAULT_AGENT_CONVERSATION_FOCUS_SCOPE = 'default'
export const AGENT_MODE_CONVERSATION_FOCUS_SCOPE = 'agent-mode'
export const PROJECT_CONVERSATION_FOCUS_SCOPE_PREFIX = 'project'

export function projectConversationFocusScope(projectId: number | string | null | undefined): AgentConversationFocusScope {
  const normalizedProjectId = positiveInteger(projectId)
  return normalizedProjectId === undefined
    ? PROJECT_CONVERSATION_FOCUS_SCOPE_PREFIX
    : `${PROJECT_CONVERSATION_FOCUS_SCOPE_PREFIX}:${normalizedProjectId}`
}

export function agentConversationFocusStorageKey(
  userId: string,
  focusScope: AgentConversationFocusScope = DEFAULT_AGENT_CONVERSATION_FOCUS_SCOPE,
): string {
  return `${normalizeAgentConversationFocusScope(focusScope)}\u0000${userId}`
}

export function normalizeAgentConversationFocusScope(
  focusScope: AgentConversationFocusScope | null | undefined,
): AgentConversationFocusScope {
  return focusScope?.trim() || DEFAULT_AGENT_CONVERSATION_FOCUS_SCOPE
}

function positiveInteger(value: number | string | null | undefined): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}
