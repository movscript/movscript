import { useCallback, useMemo } from 'react'
import {
  acceptPlanTaskReviewAction,
  cancelPlanTreeAction,
  dispatchTaskGraphAction,
  rejectPlanTaskReviewAction,
  replanPlanAction,
  reworkPlanTaskReviewAction,
  type AgentPlanActionDeps,
  type PlanDispatchSettings,
} from '@/features/agent/application/agentPlanActions'
import { providerSessionClient, type AgentTaskGraphSnapshot, type AgentRun } from '@/shared/infrastructure/providerSessionClient'

export interface UseAgentPlanActionBindingsInput {
  conversationId: string
  sessionId?: string
  run: AgentRun | null
  snapshot?: AgentTaskGraphSnapshot | null
  busy: boolean
  dispatchSettings: PlanDispatchSettings
  setBusy: (busy: boolean) => void
  setConversationRun: (conversationId: string, run: AgentRun, patch: Parameters<AgentPlanActionDeps['setConversationRun']>[1]) => void
  updateConversationRuntimeState: (conversationId: string, patch: { error?: string; loading?: boolean }) => void
  refetchPlanSnapshot: () => Promise<unknown>
}

export function useAgentPlanActionBindings({
  conversationId,
  sessionId,
  run,
  snapshot,
  busy,
  dispatchSettings,
  setBusy,
  setConversationRun,
  updateConversationRuntimeState,
  refetchPlanSnapshot,
}: UseAgentPlanActionBindingsInput) {
  const providerSessionPlanClient = useMemo(() => sessionId?.trim()
    ? providerSessionClient.forSession({ sessionId: sessionId.trim() })
    : providerSessionClient, [sessionId])
  const deps = useMemo<AgentPlanActionDeps>(() => ({
    setBusy,
    setConversationRun: (nextRun, patch) => setConversationRun(conversationId, nextRun, patch),
    reportError: (message) => updateConversationRuntimeState(conversationId, { error: message, loading: false }),
    dispatchTaskGraph: (taskGraphId, input) => providerSessionPlanClient.dispatchTaskGraph(taskGraphId, input),
    replanRun: (runId, input) => providerSessionPlanClient.replanRun(runId, input),
    updateTask: (taskId, input) => providerSessionPlanClient.updateTask(taskId, input),
    cancelRunTree: (runId, input) => providerSessionPlanClient.cancelRunTree(runId, input),
    getRun: (runId) => providerSessionPlanClient.getRun(runId),
    refetchPlanSnapshot,
  }), [conversationId, providerSessionPlanClient, refetchPlanSnapshot, setBusy, setConversationRun, updateConversationRuntimeState])

  const dispatchActiveTaskGraph = useCallback(async () => {
    if (busy) return
    await dispatchTaskGraphAction({
      run,
      snapshot,
      settings: dispatchSettings,
      deps,
    })
  }, [busy, deps, dispatchSettings, run, snapshot])

  const replanActiveTaskGraph = useCallback(async () => {
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
    dispatchActiveTaskGraph,
    rejectPlanTaskReview,
    replanActiveTaskGraph,
    reworkPlanTaskReview,
  }
}
