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
import { localAgentClient, type AgentTaskGraphSnapshot, type AgentRun } from '@/shared/infrastructure/localAgentClient'
import { appendAssistantConversationMessage, type AgentConversationMessageStore } from '@movscript/conversation'
import type { ChatMessage, ChatMessageMeta } from '@/features/agent/state/agentStore'

export interface UseAgentPlanActionBindingsInput {
  conversationId: string
  userId: string
  run: AgentRun | null
  snapshot?: AgentTaskGraphSnapshot | null
  busy: boolean
  dispatchSettings: PlanDispatchSettings
  setBusy: (busy: boolean) => void
  setConversationRun: (conversationId: string, run: AgentRun, patch: Parameters<AgentPlanActionDeps['setConversationRun']>[1]) => void
  messageStore: Pick<AgentConversationMessageStore<ChatMessage, ChatMessageMeta>, 'addMessage'>
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
    addAssistantMessage: (content, meta) => appendAssistantConversationMessage<ChatMessage, ChatMessageMeta>({
      content,
      ...(meta ? { meta } : {}),
      deps: { userId, conversationId, messageStore },
    }),
    dispatchTaskGraph: (taskGraphId, input) => localAgentClient.dispatchTaskGraph(taskGraphId, input),
    replanRun: (runId, input) => localAgentClient.replanRun(runId, input),
    updateTask: (taskId, input) => localAgentClient.updateTask(taskId, input),
    cancelRunTree: (runId, input) => localAgentClient.cancelRunTree(runId, input),
    getRun: (runId) => localAgentClient.getRun(runId),
    refetchPlanSnapshot,
  }), [conversationId, messageStore, refetchPlanSnapshot, setBusy, setConversationRun, userId])

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
