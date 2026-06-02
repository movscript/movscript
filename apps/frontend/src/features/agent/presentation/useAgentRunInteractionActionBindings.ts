import { useCallback, useMemo } from 'react'
import {
  answerRunInteractionInputAction,
  approveRunInteractionAction,
  rejectRunInteractionAction,
  type AgentRunInteractionActionDeps,
} from '@/features/agent/application/agentRunInteractionActions'
import { localAgentClient, type AgentRun } from '@/shared/infrastructure/localAgentClient'
import type { AgentInputAnswer } from '@/features/agent/domain/agentRunInteraction'

export interface UseAgentRunInteractionActionBindingsInput {
  conversationId: string
  actionableRun: AgentRun | null
  interactionRuns?: AgentRun[]
  approving: boolean
  setSubmittedInteractionRuns: (updater: (current: AgentRun[]) => AgentRun[]) => void
  setConversationRuntime: (conversationId: string, patch: Parameters<AgentRunInteractionActionDeps['setConversationRuntime']>[0]) => void
  setConversationRun: (conversationId: string, run: AgentRun, patch: Parameters<AgentRunInteractionActionDeps['setConversationRun']>[1]) => void
  streamFollowUpRun: (runId: string) => Promise<AgentRun>
  runTouchesAgentCatalog: (run: AgentRun) => boolean
  refreshAgentCatalogContext: () => void
}

export function useAgentRunInteractionActionBindings({
  conversationId,
  actionableRun,
  interactionRuns,
  approving,
  setSubmittedInteractionRuns,
  setConversationRuntime,
  setConversationRun,
  streamFollowUpRun,
  runTouchesAgentCatalog,
  refreshAgentCatalogContext,
}: UseAgentRunInteractionActionBindingsInput) {
  const deps = useMemo<AgentRunInteractionActionDeps>(() => ({
    conversationId,
    setSubmittedInteractionRuns,
    setConversationRuntime: (patch) => setConversationRuntime(conversationId, patch),
    setConversationRun: (run, patch) => setConversationRun(conversationId, run, patch),
    streamFollowUpRun,
    runTouchesAgentCatalog,
    refreshAgentCatalogContext,
  }), [
    conversationId,
    refreshAgentCatalogContext,
    runTouchesAgentCatalog,
    setConversationRun,
    setConversationRuntime,
    setSubmittedInteractionRuns,
    streamFollowUpRun,
  ])

  const runById = useMemo(() => {
    const runs = [...(interactionRuns ?? []), ...(actionableRun ? [actionableRun] : [])]
    return new Map(runs.map((run) => [run.id, run]))
  }, [actionableRun, interactionRuns])

  const approveLocalRun = useCallback(async (runId: string, approvalIds?: string[]) => {
    const run = runById.get(runId)
    if (!run || !runHasPendingApproval(run, approvalIds)) return
    await approveRunInteractionAction({
      run,
      approvalIds,
      approveInteraction: (interactionId) => localAgentClient.approveInteraction(interactionId),
      deps,
    })
  }, [deps, runById])

  const rejectLocalRun = useCallback(async (runId: string, approvalIds?: string[]) => {
    const run = runById.get(runId)
    if (!run || !runHasPendingApproval(run, approvalIds)) return
    await rejectRunInteractionAction({
      run,
      approvalIds,
      rejectInteraction: (interactionId) => localAgentClient.rejectInteraction(interactionId),
      deps,
    })
  }, [deps, runById])

  const answerLocalRunInput = useCallback(async (runId: string, requestId: string, answer: AgentInputAnswer) => {
    const run = runById.get(runId)
    if (!run || run.status !== 'requires_action' || approving) return
    await answerRunInteractionInputAction({
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

function runHasPendingApproval(run: AgentRun, approvalIds?: string[]): boolean {
  const pending = (run.pendingApprovals ?? []).filter((approval) => approval.status === 'pending')
  if (!approvalIds?.length) return pending.length > 0
  const selectedIds = new Set(approvalIds)
  return pending.some((approval) => selectedIds.has(approval.id))
}
