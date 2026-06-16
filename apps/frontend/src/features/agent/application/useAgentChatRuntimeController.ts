import { type Dispatch, type MutableRefObject, useCallback, useMemo } from 'react'
import {
  selectAgentChatRuntimeView,
  type AgentChatRuntimeAction,
  type AgentChatRuntimeState,
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

  const upsertThread = useCallback((thread: AgentChatThread) => {
    dispatchRuntime({ type: 'upsertThread', thread })
  }, [dispatchRuntime])

  const upsertThreadReadResult = useCallback((thread: AgentChatThread, input: AgentChatThreadReadInput) => {
    dispatchRuntime({ type: 'upsertThreadReadResult', thread, input })
  }, [dispatchRuntime])

  const runtimeView = useMemo(() => selectAgentChatRuntimeView(runtime), [runtime])

  return {
    ...runtimeView,
    nextRecentCapabilityEventSequence,
    readActiveRuntimeThreadId,
    setActiveThreadIdValue,
    upsertThread,
    upsertThreadReadResult,
  }
}
