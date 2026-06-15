import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import {
  agentRunProfilePresetById,
  type AgentRunProfilePresetId,
} from '@/features/agent/domain/agentRunProfilePreset'
import { errorMessage } from '@/features/agent/presentation/agentChatDataSourceShellModel'
import type {
  AgentChatDataSource,
  AgentChatModelSelection,
  AgentChatRuntimeAction,
  AgentChatRuntimeThreadReadRequest,
  AgentChatRuntimeThreadResumeRequest,
  AgentChatThread,
  AgentChatThreadReadInput,
} from '@movscript/core/agent/chat'

interface UseAgentChatThreadRuntimeEffectsInput {
  closedThreadIds: Set<string>
  dataSource?: AgentChatDataSource
  dispatchRuntime: Dispatch<AgentChatRuntimeAction>
  pendingThreadReadRequests: AgentChatRuntimeThreadReadRequest[]
  pendingThreadResumeRequests: AgentChatRuntimeThreadResumeRequest[]
  profilePresetId: AgentRunProfilePresetId
  selectedModelSelectionForRequest: (thread?: AgentChatThread | null) => AgentChatModelSelection
  setError: Dispatch<SetStateAction<string | null>>
  threads: AgentChatThread[]
  upsertThreadReadResult: (thread: AgentChatThread, input: AgentChatThreadReadInput) => void
}

export function useAgentChatThreadRuntimeEffects({
  closedThreadIds,
  dataSource,
  dispatchRuntime,
  pendingThreadReadRequests,
  pendingThreadResumeRequests,
  profilePresetId,
  selectedModelSelectionForRequest,
  setError,
  threads,
  upsertThreadReadResult,
}: UseAgentChatThreadRuntimeEffectsInput): void {
  const inFlightThreadResumeIdsRef = useRef(new Set<string>())

  useEffect(() => {
    if (!dataSource || pendingThreadReadRequests.length === 0) return
    for (const request of pendingThreadReadRequests) {
      dispatchRuntime({ type: 'beginThreadReadRequest', requestId: request.id })
      void dataSource.readThread(request.threadId, request.input)
        .then((thread) => upsertThreadReadResult(thread, request.input))
        .catch((nextError) => setError(errorMessage(nextError)))
        .finally(() => dispatchRuntime({ type: 'completeThreadReadRequest', requestId: request.id }))
    }
  }, [dataSource, dispatchRuntime, pendingThreadReadRequests, setError, upsertThreadReadResult])

  useEffect(() => {
    if (!dataSource?.resumeThread || pendingThreadResumeRequests.length === 0) return
    for (const request of pendingThreadResumeRequests) {
      if (inFlightThreadResumeIdsRef.current.has(request.threadId)) continue
      if (closedThreadIds.has(request.threadId)) {
        dispatchRuntime({ type: 'clearThreadResumeRequest', requestId: request.id })
        continue
      }
      inFlightThreadResumeIdsRef.current.add(request.threadId)
      dispatchRuntime({ type: 'beginThreadResumeRequest', requestId: request.id })
      const thread = threads.find((item) => item.id === request.threadId)
      void dataSource.resumeThread({
        threadId: request.threadId,
        runProfile: agentRunProfilePresetById(profilePresetId),
        ...(thread?.cwd?.trim() ? { cwd: thread.cwd.trim() } : {}),
        ...selectedModelSelectionForRequest(thread),
      })
        .then((resumedThread) => {
          dispatchRuntime({ type: 'completeThreadResumeRequest', requestId: request.id, thread: resumedThread })
        })
        .catch((nextError) => {
          const message = errorMessage(nextError)
          setError(message)
          dispatchRuntime({ type: 'completeThreadResumeRequest', requestId: request.id, error: message })
        })
        .finally(() => {
          inFlightThreadResumeIdsRef.current.delete(request.threadId)
        })
    }
  }, [closedThreadIds, dataSource, dispatchRuntime, pendingThreadResumeRequests, profilePresetId, selectedModelSelectionForRequest, setError, threads])
}
