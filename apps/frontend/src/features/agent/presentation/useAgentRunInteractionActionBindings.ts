import { useCallback, useMemo } from 'react'
import {
  answerRunInteractionInputAction,
  approveRunInteractionAction,
  type AgentRunApprovalDecisionInput,
  rejectRunInteractionAction,
  type AgentRunInteractionActionDeps,
} from '@/features/agent/application/agentRunInteractionActions'
import { createAgentProviderSessionCommandService } from '@/features/agent/application/agentProviderSessionCommandService'
import type { AgentRun } from '@movscript/core/agent/protocol'
import type { AgentInputAnswer } from '@/features/agent/domain/agentRunInteraction'

export interface UseAgentRunInteractionActionBindingsInput {
  conversationId: string
  sessionId?: string
  actionableRun: AgentRun | null
  interactionRuns?: AgentRun[]
  approving: boolean
  setSubmittedInteractionRuns: (updater: (current: AgentRun[]) => AgentRun[]) => void
  updateConversationRuntimeState: (conversationId: string, patch: Parameters<AgentRunInteractionActionDeps['updateConversationRuntimeState']>[0]) => void
  setConversationRun: (conversationId: string, run: AgentRun, patch: Parameters<AgentRunInteractionActionDeps['setConversationRun']>[1]) => void
  streamFollowUpRun: (runId: string) => Promise<AgentRun>
}

export function useAgentRunInteractionActionBindings({
  conversationId,
  sessionId,
  actionableRun,
  interactionRuns,
  approving,
  setSubmittedInteractionRuns,
  updateConversationRuntimeState,
  setConversationRun,
  streamFollowUpRun,
}: UseAgentRunInteractionActionBindingsInput) {
  const commandService = useMemo(() => createAgentProviderSessionCommandService({ sessionId }), [sessionId])

  const deps = useMemo<AgentRunInteractionActionDeps>(() => ({
    conversationId,
    setSubmittedInteractionRuns,
    updateConversationRuntimeState: (patch) => updateConversationRuntimeState(conversationId, patch),
    setConversationRun: (run, patch) => setConversationRun(conversationId, run, patch),
    streamFollowUpRun,
  }), [
    conversationId,
    setConversationRun,
    updateConversationRuntimeState,
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
      approveInteraction: (interactionId, decision) => commandService.approveInteraction(interactionId, decision),
      deps,
    })
  }, [commandService, deps, runById])

  const rejectRun = useCallback(async (runId: string, approvalIds?: string[]) => {
    const run = runById.get(runId)
    if (!run || !runHasPendingApproval(run, approvalIds)) return
    await rejectRunInteractionAction({
      run,
      approvalIds,
      rejectInteraction: (interactionId) => commandService.rejectInteraction(interactionId),
      deps,
    })
  }, [commandService, deps, runById])

  const answerRunInput = useCallback(async (runId: string, requestId: string, answer: AgentInputAnswer) => {
    const run = runById.get(runId)
    if (!run || run.status !== 'requires_action' || approving) return
    await answerRunInteractionInputAction({
      run,
      requestId,
      answer,
      answerRunInput: (runId, input) => commandService.answerRunInput(runId, input),
      deps,
    })
  }, [approving, commandService, deps, runById])

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
