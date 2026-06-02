import type { AgentPanelDraftPayload } from '@/features/agent/application/agentPanelBridge'

export interface AgentPanelDraftConversationDeps {
  userId: string
  createConversationForDraft: (payload: AgentPanelDraftPayload) => Promise<string>
  getActiveConversationId: (userId: string) => string | null | undefined
  setActiveConversation: (userId: string, conversationId: string) => void
  updateConversationTitle: (userId: string, conversationId: string, title: string) => void
  attachPageTaskConversation: (requestId: string, conversationId: string) => void
}

export async function activateConversationForPanelDraft(
  payload: AgentPanelDraftPayload | null | undefined,
  deps: AgentPanelDraftConversationDeps,
): Promise<string | null> {
  if (!payload?.message?.trim()) return null
  const activeConversationId = payload.newConversation ? null : deps.getActiveConversationId(deps.userId)
  const conversationId = activeConversationId ?? await deps.createConversationForDraft(payload)
  if (payload.title) deps.updateConversationTitle(deps.userId, conversationId, payload.title)
  deps.setActiveConversation(deps.userId, conversationId)
  if (payload.requestId) deps.attachPageTaskConversation(payload.requestId, conversationId)
  return conversationId
}

export async function consumeQueuedPanelDrafts(
  consumeDraft: () => AgentPanelDraftPayload | null | undefined,
  deps: AgentPanelDraftConversationDeps,
): Promise<string[]> {
  const conversationIds: string[] = []
  let pending = consumeDraft()
  while (pending?.message?.trim()) {
    const conversationId = await activateConversationForPanelDraft(pending, deps)
    if (conversationId) conversationIds.push(conversationId)
    pending = consumeDraft()
  }
  return conversationIds
}
