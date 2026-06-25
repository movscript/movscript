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
import { createAgentProviderSessionCommandService } from '@/features/agent/application/agentProviderSessionCommandService'
import type { AgentTaskGraphSnapshot, AgentRun } from '@movscript/agent-protocol'

export interface UseAgentPlanActionBindingsInput {
  conversationId: string
  providerSessionTreeId?: string
  sessionId?: string // legacy provider-session input; prefer providerSessionTreeId.
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
  providerSessionTreeId,
  sessionId: legacySessionId,
  run,
  snapshot,
  busy,
  dispatchSettings,
  setBusy,
  setConversationRun,
  updateConversationRuntimeState,
  refetchPlanSnapshot,
}: UseAgentPlanActionBindingsInput) {
  const normalizedProviderSessionTreeId = providerSessionTreeId?.trim() || legacySessionId?.trim() || undefined
  const commandService = useMemo(() => createAgentProviderSessionCommandService({ providerSessionTreeId: normalizedProviderSessionTreeId }), [normalizedProviderSessionTreeId])
  const deps = useMemo<AgentPlanActionDeps>(() => ({
    setBusy,
    setConversationRun: (nextRun, patch) => setConversationRun(conversationId, nextRun, patch),
    reportError: (message) => updateConversationRuntimeState(conversationId, { error: message, loading: false }),
    dispatchTaskGraph: (taskGraphId, input) => commandService.dispatchTaskGraph(taskGraphId, input),
    replanRun: (runId, input) => commandService.replanRun(runId, input),
    updateTask: (taskId, input) => commandService.updateTask(taskId, input),
    cancelRunTree: (runId, input) => commandService.cancelRunTree(runId, input),
    getRun: (runId) => commandService.getRun(runId),
    refetchPlanSnapshot,
  }), [commandService, conversationId, refetchPlanSnapshot, setBusy, setConversationRun, updateConversationRuntimeState])

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
