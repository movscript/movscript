import { extractAgentTaskArtifacts, type AgentTaskArtifactRef } from '@/features/agent/domain/agentArtifacts'
import { loadRuntimeThreadProjection } from '@/features/agent/application/agentRuntimeThreadHydration'
import { completeRuntimeSendRunResult } from '@movscript/conversation'
import { threadResolutionActivityEvent, upsertActivityEvent } from '@/features/agent/application/agentSendActivity'
import type { AgentSendDraft } from '@/features/agent/application/agentSendDraft'
import type { AgentRun, AgentThread, RunMessageResult } from '@/shared/infrastructure/localAgentClient'
import type { RawResource } from '@/types'
import type { AgentLivePendingAssistantState } from '@/features/agent/presentation/agentLiveRunActivity'
import type { ChatMessage, ChatMessageMeta, ChatRunActivityEvent } from '@/features/agent/state/agentStore'
import type { AgentConversationMessageStore } from '@movscript/conversation'

export interface CompleteSendRunResultDeps {
  userId: string
  conversationId: string
  localUserMessageId: string
  liveEvents: () => ChatRunActivityEvent[]
  setLiveEventsRef: (events: ChatRunActivityEvent[]) => void
  getRun: (runId: string) => Promise<AgentRun>
  setLocalThreadId: (conversationId: string, threadId: string) => void
  setConversationSessionId?: (conversationId: string, sessionId: string) => void
  setConversationRuntimeSessionId?: (userId: string, conversationId: string, sessionId: string) => void
  setConversationRuntimeThreadId: (userId: string, conversationId: string, threadId: string) => void
  messageStore: Pick<AgentConversationMessageStore<ChatMessage, ChatMessageMeta>, 'updateMessageMeta' | 'setConversationMessages'>
  updateConversationTitle: (userId: string, conversationId: string, title: string) => void
  setPageTaskRunning: (requestId: string, patch: { conversationId: string; sessionId?: string; run?: AgentRun; thread?: AgentThread; threadId?: string; artifacts?: AgentTaskArtifactRef[] }) => void
  setConversationRun: (conversationId: string, run: AgentRun, patch: { loading?: boolean; building?: boolean; approving?: boolean; stopping?: boolean; stopRequested?: boolean }) => void
  setPendingHttpEvents: (events: ChatRunActivityEvent[]) => void
  setPendingAssistantState: (state: AgentLivePendingAssistantState | null) => void
  appendAssistantRunResult: (run: AgentRun, thread: AgentThread, liveEvents: ChatRunActivityEvent[]) => Promise<unknown>
  getExistingMessages: () => ChatMessage[]
  setLiveTraceEvents: (events: ChatRunActivityEvent[]) => void
  fetchResourceById: (id: number) => Promise<RawResource | undefined>
  runTouchesAgentCatalog: (run: AgentRun) => boolean
  refreshAgentCatalogContext: () => void
  notifyRunSettled: (input: {
    requestId?: string
    status: 'completed' | 'error' | 'cancelled'
    run: AgentRun
    thread: AgentThread
    artifacts: AgentTaskArtifactRef[]
  }) => void
}

export async function completeSendRunResult(input: {
  draft: AgentSendDraft
  runResult: RunMessageResult
  deps: CompleteSendRunResultDeps
}): Promise<{ run: AgentRun; thread: AgentThread; artifacts: AgentTaskArtifactRef[]; liveEvents: ChatRunActivityEvent[] }> {
  const { draft, runResult, deps } = input
  return completeRuntimeSendRunResult<ChatMessage, ChatMessageMeta, AgentRun, AgentThread, AgentTaskArtifactRef, ChatRunActivityEvent, RunMessageResult['threadResolution'], AgentLivePendingAssistantState>({
    draft,
    runResult,
    deps: {
      ...deps,
      extractArtifacts: extractAgentTaskArtifacts,
      threadResolutionActivityEvent,
      upsertActivityEvent,
      loadRuntimeThreadProjection: (projectionInput) => loadRuntimeThreadProjection(projectionInput, {
        fetchResourceById: deps.fetchResourceById,
      }),
    },
  })
}
