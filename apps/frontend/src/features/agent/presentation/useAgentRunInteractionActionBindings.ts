import { useCallback, useMemo } from 'react'
import {
  answerRunInteractionInputAction,
  approveRunInteractionAction,
  type AgentRunApprovalDecisionInput,
  rejectRunInteractionAction,
  type AgentRunInteractionActionDeps,
} from '@/features/agent/application/agentRunInteractionActions'
import { providerSessionClient, type AgentRun } from '@/shared/infrastructure/providerSessionClient'
import type { AgentInputAnswer } from '@/features/agent/domain/agentRunInteraction'

export interface UseAgentRunInteractionActionBindingsInput {
  conversationId: string
  sessionId?: string
  actionableRun: AgentRun | null
  interactionRuns?: AgentRun[]
  approving: boolean
  setSubmittedInteractionRuns: (updater: (current: AgentRun[]) => AgentRun[]) => void
  setConversationProviderSessionState: (conversationId: string, patch: Parameters<AgentRunInteractionActionDeps['setConversationProviderSessionState']>[0]) => void
  setConversationRun: (conversationId: string, run: AgentRun, patch: Parameters<AgentRunInteractionActionDeps['setConversationRun']>[1]) => void
  streamFollowUpRun: (runId: string) => Promise<AgentRun>
  runTouchesProviderCatalog: (run: AgentRun) => boolean
  refreshProviderCatalogContext: () => void
}

export function useAgentRunInteractionActionBindings({
  conversationId,
  sessionId,
  actionableRun,
  interactionRuns,
  approving,
  setSubmittedInteractionRuns,
  setConversationProviderSessionState,
  setConversationRun,
  streamFollowUpRun,
  runTouchesProviderCatalog,
  refreshProviderCatalogContext,
}: UseAgentRunInteractionActionBindingsInput) {
  const providerSessionRunClient = useMemo(() => sessionId?.trim()
    ? providerSessionClient.forSession({ sessionId: sessionId.trim() })
    : providerSessionClient, [sessionId])

  const deps = useMemo<AgentRunInteractionActionDeps>(() => ({
    conversationId,
    setSubmittedInteractionRuns,
    setConversationProviderSessionState: (patch) => setConversationProviderSessionState(conversationId, patch),
    setConversationRun: (run, patch) => setConversationRun(conversationId, run, patch),
    streamFollowUpRun,
    runTouchesProviderCatalog,
    refreshProviderCatalogContext,
  }), [
    conversationId,
    refreshProviderCatalogContext,
    runTouchesProviderCatalog,
    setConversationRun,
    setConversationProviderSessionState,
    setSubmittedInteractionRuns,
    streamFollowUpRun,
  ])

  const runById = useMemo(() => {
    const runs = [...(interactionRuns ?? []), ...(actionableRun ? [actionableRun] : [])]
    return new Map(runs.map((run) => [run.id, run]))
  }, [actionableRun, interactionRuns])

  const approveRun = useCallback(async (runId: string, approvalIds?: string[], approvalDecision?: AgentRunApprovalDecisionInput) => {
    const run = runById.get(runId)
    if (!run || !runHasPendingApproval(run, approvalIds)) return
    await approveRunInteractionAction({
      run,
      approvalIds,
      approvalDecision,
      approveInteraction: (interactionId, decision) => providerSessionRunClient.approveInteraction(interactionId, decision),
      deps,
    })
  }, [deps, providerSessionRunClient, runById])

  const rejectRun = useCallback(async (runId: string, approvalIds?: string[]) => {
    const run = runById.get(runId)
    if (!run || !runHasPendingApproval(run, approvalIds)) return
    await rejectRunInteractionAction({
      run,
      approvalIds,
      rejectInteraction: (interactionId) => providerSessionRunClient.rejectInteraction(interactionId),
      deps,
    })
  }, [deps, providerSessionRunClient, runById])

  const answerRunInput = useCallback(async (runId: string, requestId: string, answer: AgentInputAnswer) => {
    const run = runById.get(runId)
    if (!run || run.status !== 'requires_action' || approving) return
    await answerRunInteractionInputAction({
      run,
      requestId,
      answer,
      answerRunInput: (runId, input) => providerSessionRunClient.answerRunInput(runId, input),
      deps,
    })
  }, [approving, deps, providerSessionRunClient, runById])

  const approveActiveRun = useCallback(async (approvalIds?: string[], approvalDecision?: AgentRunApprovalDecisionInput) => {
    if (!actionableRun) return
    await approveRun(actionableRun.id, approvalIds, approvalDecision)
  }, [actionableRun, approveRun])

  const rejectActiveRun = useCallback(async (approvalIds?: string[]) => {
    if (!actionableRun) return
    await rejectRun(actionableRun.id, approvalIds)
  }, [actionableRun, rejectRun])

  const answerActiveRunInput = useCallback(async (requestId: string, answer: AgentInputAnswer) => {
    if (!actionableRun) return
    await answerRunInput(actionableRun.id, requestId, answer)
  }, [actionableRun, answerRunInput])

  return {
    answerActiveRunInput,
    answerRunInput,
    approveActiveRun,
    approveRun,
    rejectActiveRun,
    rejectRun,
  }
}

function runHasPendingApproval(run: AgentRun, approvalIds?: string[]): boolean {
  const pending = (run.pendingApprovals ?? []).filter((approval) => approval.status === 'pending')
  if (!approvalIds?.length) return pending.length > 0
  const selectedIds = new Set(approvalIds)
  return pending.some((approval) => selectedIds.has(approval.id))
}
