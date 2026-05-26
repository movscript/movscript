import type { AgentPanelRunSettledPayload } from '@/features/agent/application/agentPanelBridge'
import { appendAssistantConversationMessage, type AgentConversationMessageStore } from '@movscript/conversation'
import type { AgentConversationRuntimeState } from '@/features/agent/state/agentSessionStore'
import type { ChatMessage, ChatMessageMeta, ChatRunActivityEvent } from '@/features/agent/state/agentStore'

type ConversationRuntimePatch = Partial<Omit<AgentConversationRuntimeState, 'conversationId' | 'updatedAt'>>

export interface SendErrorCleanupDeps {
  userId: string
  conversationId: string
  requestId?: string
  streamingMessageId: () => string | null
  messageStore: Pick<AgentConversationMessageStore<ChatMessage, ChatMessageMeta>, 'removeMessage'>
  setPendingAssistantState: (state: null) => void
  setPendingHttpEvents: (events: ChatRunActivityEvent[]) => void
  resetStreamingAssistant: () => void
  setConversationRuntime: (conversationId: string, patch: ConversationRuntimePatch) => void
  notifyRunSettled: (payload: AgentPanelRunSettledPayload) => void
}

export interface SendFailureDeps extends SendErrorCleanupDeps {
  messageStore: Pick<AgentConversationMessageStore<ChatMessage, ChatMessageMeta>, 'addMessage' | 'removeMessage'>
  toastError: (error: unknown) => void
  assistantErrorContent: (message: string) => string
}

export function handleSendAbort(error: unknown, deps: SendErrorCleanupDeps): void {
  const message = errorMessage(error)
  cleanupStreamingState(deps)
  deps.setConversationRuntime(deps.conversationId, { stopRequested: false, stopping: false, loading: false, building: false })
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
  appendAssistantConversationMessage<ChatMessage, ChatMessageMeta>({
    content: deps.assistantErrorContent(message),
    deps: {
      userId: deps.userId,
      conversationId: deps.conversationId,
      messageStore: deps.messageStore,
    },
  })
  deps.setConversationRuntime(deps.conversationId, { error: message, loading: false, building: false })
  deps.notifyRunSettled({
    ...(deps.requestId ? { requestId: deps.requestId } : {}),
    status: 'error',
    error: message,
  })
}

function cleanupStreamingState(deps: SendErrorCleanupDeps): void {
  const streamingMessageId = deps.streamingMessageId()
  if (streamingMessageId) deps.messageStore.removeMessage(deps.userId, deps.conversationId, streamingMessageId)
  deps.setPendingAssistantState(null)
  deps.setPendingHttpEvents([])
  deps.resetStreamingAssistant()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
