import type { AgentPanelWorkspacePayload } from '@/features/agent/application/agentPanelBridge'

export interface AgentPanelWorkspaceConversationDeps {
  userId: string
  createConversationForWorkspace: (payload: AgentPanelWorkspacePayload) => Promise<string>
  getActiveConversationId: (userId: string) => string | null | undefined
  setActiveConversation: (userId: string, conversationId: string) => void
  updateConversationTitle: (userId: string, conversationId: string, title: string) => void
  attachPageTaskConversation: (requestId: string, conversationId: string) => void
}

export async function activateConversationForPanelWorkspace(
  payload: AgentPanelWorkspacePayload | null | undefined,
  deps: AgentPanelWorkspaceConversationDeps,
): Promise<string | null> {
  if (!payload?.message?.trim()) return null
  const activeConversationId = payload.newConversation ? null : deps.getActiveConversationId(deps.userId)
  const conversationId = activeConversationId ?? await deps.createConversationForWorkspace(payload)
  if (payload.title) deps.updateConversationTitle(deps.userId, conversationId, payload.title)
  deps.setActiveConversation(deps.userId, conversationId)
  if (payload.requestId) deps.attachPageTaskConversation(payload.requestId, conversationId)
  return conversationId
}

export async function consumeQueuedPanelWorkspaces(
  consumeWorkspace: () => AgentPanelWorkspacePayload | null | undefined,
  deps: AgentPanelWorkspaceConversationDeps,
): Promise<string[]> {
  const conversationIds: string[] = []
  let pending = consumeWorkspace()
  while (pending?.message?.trim()) {
    const conversationId = await activateConversationForPanelWorkspace(pending, deps)
    if (conversationId) conversationIds.push(conversationId)
    pending = consumeWorkspace()
  }
  return conversationIds
}
