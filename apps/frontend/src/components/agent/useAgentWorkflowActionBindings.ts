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
  workflowRuns?: AgentRun[]
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
  workflowRuns,
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

  const runById = useMemo(() => {
    const runs = [...(workflowRuns ?? []), ...(actionableRun ? [actionableRun] : [])]
    return new Map(runs.map((run) => [run.id, run]))
  }, [actionableRun, workflowRuns])

  const approveLocalRun = useCallback(async (runId: string, approvalIds?: string[]) => {
    const run = runById.get(runId)
    if (!run || run.status !== 'requires_action') return
    await approveWorkflowRunAction({
      run,
      approvalIds,
      approveInteraction: (interactionId) => localAgentClient.approveInteraction(interactionId),
      deps,
    })
  }, [deps, runById])

  const rejectLocalRun = useCallback(async (runId: string, approvalIds?: string[]) => {
    const run = runById.get(runId)
    if (!run || run.status !== 'requires_action') return
    await rejectWorkflowRunAction({
      run,
      approvalIds,
      rejectInteraction: (interactionId) => localAgentClient.rejectInteraction(interactionId),
      deps,
    })
  }, [deps, runById])

  const answerLocalRunInput = useCallback(async (runId: string, requestId: string, answer: AgentInputAnswer) => {
    const run = runById.get(runId)
    if (!run || run.status !== 'requires_action' || approving) return
    await answerWorkflowRunInputAction({
      run,
      requestId,
      answer,
      answerRunInput: (runId, input) => localAgentClient.answerRunInput(runId, input),
      deps,
    })
  }, [approving, deps, runById])

  const approveActiveLocalRun = useCallback(async (approvalIds?: string[]) => {
    if (!actionableRun) return
    await approveLocalRun(actionableRun.id, approvalIds)
  }, [actionableRun, approveLocalRun])

  const rejectActiveLocalRun = useCallback(async (approvalIds?: string[]) => {
    if (!actionableRun) return
    await rejectLocalRun(actionableRun.id, approvalIds)
  }, [actionableRun, rejectLocalRun])

  const answerActiveLocalRunInput = useCallback(async (requestId: string, answer: AgentInputAnswer) => {
    if (!actionableRun) return
    await answerLocalRunInput(actionableRun.id, requestId, answer)
  }, [actionableRun, answerLocalRunInput])

  return {
    answerActiveLocalRunInput,
    answerLocalRunInput,
    approveActiveLocalRun,
    approveLocalRun,
    rejectActiveLocalRun,
    rejectLocalRun,
  }
}
