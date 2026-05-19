import type { AgentPanelDraftPayload } from '@/lib/agentPanelBridge'

export interface AgentPanelDraftConversationDeps {
  userId: string
  createConversation: (userId: string) => string
  getActiveConversationId: (userId: string) => string | null | undefined
  setActiveConversation: (userId: string, conversationId: string) => void
  updateConversationTitle: (userId: string, conversationId: string, title: string) => void
  attachPageTaskConversation: (requestId: string, conversationId: string) => void
}

export function activateConversationForPanelDraft(
  payload: AgentPanelDraftPayload | null | undefined,
  deps: AgentPanelDraftConversationDeps,
): string | null {
  if (!payload?.message?.trim()) return null
  const conversationId = payload.newConversation
    ? deps.createConversation(deps.userId)
    : deps.getActiveConversationId(deps.userId) ?? deps.createConversation(deps.userId)
  if (payload.title) deps.updateConversationTitle(deps.userId, conversationId, payload.title)
  deps.setActiveConversation(deps.userId, conversationId)
  if (payload.requestId) deps.attachPageTaskConversation(payload.requestId, conversationId)
  return conversationId
}

export function consumeQueuedPanelDrafts(
  consumeDraft: () => AgentPanelDraftPayload | null | undefined,
  deps: AgentPanelDraftConversationDeps,
): string[] {
  const conversationIds: string[] = []
  let pending = consumeDraft()
  while (pending?.message?.trim()) {
    const conversationId = activateConversationForPanelDraft(pending, deps)
    if (conversationId) conversationIds.push(conversationId)
    pending = consumeDraft()
  }
  return conversationIds
}
