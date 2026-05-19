import { useCallback, useMemo } from 'react'
import {
  acceptPlanTaskReviewAction,
  cancelPlanTreeAction,
  dispatchPlanAction,
  rejectPlanTaskReviewAction,
  replanPlanAction,
  reworkPlanTaskReviewAction,
  type AgentPlanActionDeps,
  type PlanDispatchSettings,
} from '@/lib/agentPlanActions'
import { localAgentClient, type AgentPlanSnapshot, type AgentRun } from '@/lib/localAgentClient'
import type { AgentConversationMessageStore } from '@/lib/agentConversationMessageStore'

export interface UseAgentPlanActionBindingsInput {
  conversationId: string
  userId: string
  run: AgentRun | null
  snapshot?: AgentPlanSnapshot | null
  busy: boolean
  dispatchSettings: PlanDispatchSettings
  setBusy: (busy: boolean) => void
  setConversationRun: (conversationId: string, run: AgentRun, patch: Parameters<AgentPlanActionDeps['setConversationRun']>[1]) => void
  messageStore: Pick<AgentConversationMessageStore, 'addMessage'>
  refetchPlanSnapshot: () => Promise<unknown>
}

export function useAgentPlanActionBindings({
  conversationId,
  userId,
  run,
  snapshot,
  busy,
  dispatchSettings,
  setBusy,
  setConversationRun,
  messageStore,
  refetchPlanSnapshot,
}: UseAgentPlanActionBindingsInput) {
  const deps = useMemo<AgentPlanActionDeps>(() => ({
    setBusy,
    setConversationRun: (nextRun, patch) => setConversationRun(conversationId, nextRun, patch),
    addAssistantMessage: (message) => messageStore.addMessage(userId, conversationId, message),
    dispatchPlan: (planId, input) => localAgentClient.dispatchPlan(planId, input),
    replanRun: (runId, input) => localAgentClient.replanRun(runId, input),
    updateTask: (taskId, input) => localAgentClient.updateTask(taskId, input),
    cancelRunTree: (runId, input) => localAgentClient.cancelRunTree(runId, input),
    getRun: (runId) => localAgentClient.getRun(runId),
    refetchPlanSnapshot,
  }), [conversationId, messageStore, refetchPlanSnapshot, setBusy, setConversationRun, userId])

  const dispatchActivePlan = useCallback(async () => {
    if (busy) return
    await dispatchPlanAction({
      run,
      snapshot,
      settings: dispatchSettings,
      deps,
    })
  }, [busy, deps, dispatchSettings, run, snapshot])

  const replanActivePlan = useCallback(async () => {
    if (busy) return
    await replanPlanAction({
      run,
      snapshot,
      settings: dispatchSettings,
      deps,
    })
  }, [busy, deps, dispatchSettings, run, snapshot])

  const acceptPlanTaskReview = useCallback(async (taskId: string) => {
    if (busy) return
    await acceptPlanTaskReviewAction({ taskId, deps })
  }, [busy, deps])

  const rejectPlanTaskReview = useCallback(async (taskId: string) => {
    if (busy) return
    await rejectPlanTaskReviewAction({ taskId, deps })
  }, [busy, deps])

  const reworkPlanTaskReview = useCallback(async (taskId: string) => {
    if (busy) return
    await reworkPlanTaskReviewAction({
      taskId,
      run,
      snapshot,
      settings: dispatchSettings,
      deps,
    })
  }, [busy, deps, dispatchSettings, run, snapshot])

  const cancelActivePlanTree = useCallback(async () => {
    if (busy) return
    await cancelPlanTreeAction({
      run,
      snapshot,
      deps,
    })
  }, [busy, deps, run, snapshot])

  return {
    acceptPlanTaskReview,
    cancelActivePlanTree,
    dispatchActivePlan,
    rejectPlanTaskReview,
    replanActivePlan,
    reworkPlanTaskReview,
  }
}
