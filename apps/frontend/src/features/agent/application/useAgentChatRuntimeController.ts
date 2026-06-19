import { type Dispatch, type MutableRefObject, useCallback, useMemo } from 'react'
import {
  selectAgentChatRuntimeView,
  type AgentChatRuntimeAction,
  type AgentChatRuntimeState,
  type AgentChatRuntimeThreadLifecycleStatus,
  type AgentChatThread,
  type AgentChatThreadReadInput,
} from '@movscript/core/agent/chat'

interface UseAgentChatRuntimeControllerInput {
  activeThreadIdRef: MutableRefObject<string | null>
  dispatchRuntime: Dispatch<AgentChatRuntimeAction>
  recentCapabilityEventSequenceRef: MutableRefObject<number>
  runtime: AgentChatRuntimeState
  setActiveThreadIdRefValue: (threadId: string | null) => void
}

export function useAgentChatRuntimeController({
  activeThreadIdRef,
  dispatchRuntime,
  recentCapabilityEventSequenceRef,
  runtime,
  setActiveThreadIdRefValue,
}: UseAgentChatRuntimeControllerInput) {
  const setActiveThreadIdValue = useCallback((threadId: string | null) => {
    setActiveThreadIdRefValue(threadId)
    dispatchRuntime({ type: 'setActiveThreadId', threadId })
  }, [dispatchRuntime, setActiveThreadIdRefValue])

  const readActiveRuntimeThreadId = useCallback(() => activeThreadIdRef.current, [activeThreadIdRef])
  const nextRecentCapabilityEventSequence = useCallback(() => ++recentCapabilityEventSequenceRef.current, [recentCapabilityEventSequenceRef])

  const upsertThread = useCallback((thread: AgentChatThread, input?: { lifecycleStatus?: AgentChatRuntimeThreadLifecycleStatus }) => {
    dispatchRuntime({ type: 'upsertThread', thread, lifecycleStatus: input?.lifecycleStatus })
  }, [dispatchRuntime])

  const upsertThreadReadResult = useCallback((thread: AgentChatThread, input: AgentChatThreadReadInput) => {
    dispatchRuntime({ type: 'upsertThreadReadResult', thread, input })
  }, [dispatchRuntime])

  const markThreadMaterializing = useCallback((threadId: string) => {
    dispatchRuntime({ type: 'markThreadMaterializing', threadId })
  }, [dispatchRuntime])

  const markThreadReady = useCallback((threadId: string) => {
    dispatchRuntime({ type: 'markThreadReady', threadId })
  }, [dispatchRuntime])

  const markThreadFailed = useCallback((threadId: string, error?: string) => {
    dispatchRuntime({ type: 'markThreadFailed', threadId, error })
  }, [dispatchRuntime])

  const runtimeView = useMemo(() => selectAgentChatRuntimeView(runtime), [runtime])

  return {
    ...runtimeView,
    markThreadFailed,
    markThreadMaterializing,
    markThreadReady,
    nextRecentCapabilityEventSequence,
    readActiveRuntimeThreadId,
    setActiveThreadIdValue,
    upsertThread,
    upsertThreadReadResult,
  }
}
