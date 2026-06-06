import type { AgentPanelRunSettledPayload } from '@/features/agent/application/agentPanelBridge'
import type { AgentConversationProviderSessionState } from '@/features/agent/state/agentSessionStore'
import type { ChatRunActivityEvent } from '@/features/agent/state/agentStore'

type ConversationProviderSessionPatch = Partial<Omit<AgentConversationProviderSessionState, 'conversationId' | 'updatedAt'>>

export interface SendErrorCleanupDeps {
  userId: string
  conversationId: string
  requestId?: string
  setPendingAssistantState: (state: null) => void
  setPendingHttpEvents: (events: ChatRunActivityEvent[]) => void
  resetStreamingAssistant: () => void
  setConversationProviderSessionState: (conversationId: string, patch: ConversationProviderSessionPatch) => void
  notifyRunSettled: (payload: AgentPanelRunSettledPayload) => void
}

export interface SendFailureDeps extends SendErrorCleanupDeps {
  toastError: (error: unknown) => void
  assistantErrorContent: (message: string) => string
}

export function handleSendAbort(error: unknown, deps: SendErrorCleanupDeps): void {
  const message = errorMessage(error)
  cleanupStreamingState(deps)
  deps.setConversationProviderSessionState(deps.conversationId, { stopRequested: false, stopping: false, loading: false, building: false })
  deps.notifyRunSettled({
    ...(deps.requestId ? { requestId: deps.requestId } : {}),
    status: 'cancelled',
    error: message,
  })
}

export function handleSendFailure(error: unknown, deps: SendFailureDeps): void {
  const message = errorMessage(error)
  deps.toastError(error)
  cleanupStreamingState(deps)
  deps.setConversationProviderSessionState(deps.conversationId, { error: deps.assistantErrorContent(message), loading: false, building: false })
  deps.notifyRunSettled({
    ...(deps.requestId ? { requestId: deps.requestId } : {}),
    status: 'error',
    error: message,
  })
}

function cleanupStreamingState(deps: SendErrorCleanupDeps): void {
  deps.setPendingAssistantState(null)
  deps.setPendingHttpEvents([])
  deps.resetStreamingAssistant()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
