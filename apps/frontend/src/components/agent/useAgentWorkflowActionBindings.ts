import { useCallback, useMemo } from 'react'
import {
  answerWorkflowRunInputAction,
  approveWorkflowRunAction,
  rejectWorkflowRunAction,
  type AgentWorkflowActionDeps,
} from '@/lib/agentWorkflowActions'
import { localAgentClient, type AgentRun, type AgentThread } from '@/lib/localAgentClient'
import type { AgentInputAnswer } from '@/lib/agentWorkflowInteraction'
import type { AgentConversationMessageStore } from '@/lib/agentConversationMessageStore'
import type { ChatRunActivityEvent } from '@/store/agentStore'

export interface UseAgentWorkflowActionBindingsInput {
  conversationId: string
  userId: string
  actionableRun: AgentRun | null
  approving: boolean
  setSubmittedInteractionRuns: (updater: (current: AgentRun[]) => AgentRun[]) => void
  setConversationRuntime: (conversationId: string, patch: Parameters<AgentWorkflowActionDeps['setConversationRuntime']>[0]) => void
  setConversationRun: (conversationId: string, run: AgentRun, patch: Parameters<AgentWorkflowActionDeps['setConversationRun']>[1]) => void
  messageStore: Pick<AgentConversationMessageStore, 'addMessage'>
  streamFollowUpRun: (runId: string) => Promise<AgentRun>
  appendAssistantRunResult: (run: AgentRun, thread: AgentThread, liveEvents: ChatRunActivityEvent[]) => Promise<unknown>
  liveEvents: () => ChatRunActivityEvent[]
  runTouchesAgentCatalog: (run: AgentRun) => boolean
  refreshAgentCatalogContext: () => void
}

export function useAgentWorkflowActionBindings({
  conversationId,
  userId,
  actionableRun,
  approving,
  setSubmittedInteractionRuns,
  setConversationRuntime,
  setConversationRun,
  messageStore,
  streamFollowUpRun,
  appendAssistantRunResult,
  liveEvents,
  runTouchesAgentCatalog,
  refreshAgentCatalogContext,
}: UseAgentWorkflowActionBindingsInput) {
  const deps = useMemo<AgentWorkflowActionDeps>(() => ({
    setSubmittedInteractionRuns,
    setConversationRuntime: (patch) => setConversationRuntime(conversationId, patch),
    setConversationRun: (run, patch) => setConversationRun(conversationId, run, patch),
    addAssistantMessage: (message) => messageStore.addMessage(userId, conversationId, message),
    getThread: (threadId) => localAgentClient.getThread(threadId),
    streamFollowUpRun,
    appendAssistantRunResult,
    liveEvents,
    runTouchesAgentCatalog,
    refreshAgentCatalogContext,
  }), [
    appendAssistantRunResult,
    conversationId,
    liveEvents,
    messageStore,
    refreshAgentCatalogContext,
    runTouchesAgentCatalog,
    setConversationRun,
    setConversationRuntime,
    setSubmittedInteractionRuns,
    streamFollowUpRun,
    userId,
  ])

  const approveActiveLocalRun = useCallback(async (approvalIds?: string[]) => {
    const run = actionableRun
    if (!run || run.status !== 'requires_action' || approving) return
    await approveWorkflowRunAction({
      run,
      approvalIds,
      approveRun: (runId, input) => localAgentClient.approveRun(runId, input),
      deps,
    })
  }, [actionableRun, approving, deps])

  const rejectActiveLocalRun = useCallback(async (approvalIds?: string[]) => {
    const run = actionableRun
    if (!run || run.status !== 'requires_action' || approving) return
    await rejectWorkflowRunAction({
      run,
      approvalIds,
      rejectRun: (runId, input) => localAgentClient.rejectRun(runId, input),
      deps,
    })
  }, [actionableRun, approving, deps])

  const answerActiveLocalRunInput = useCallback(async (requestId: string, answer: AgentInputAnswer) => {
    const run = actionableRun
    if (!run || run.status !== 'requires_action' || approving) return
    await answerWorkflowRunInputAction({
      run,
      requestId,
      answer,
      answerRunInput: (runId, input) => localAgentClient.answerRunInput(runId, input),
      deps,
    })
  }, [actionableRun, approving, deps])

  return {
    answerActiveLocalRunInput,
    approveActiveLocalRun,
    rejectActiveLocalRun,
  }
}
