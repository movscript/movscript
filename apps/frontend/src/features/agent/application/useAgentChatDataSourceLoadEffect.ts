import { useEffect, type Dispatch, type SetStateAction } from 'react'
import { type AgentChatDataSource, type AgentChatRuntimeAction } from '@movscript/core/agent/chat'
import { errorMessage } from '@/features/agent/presentation/agentChatDataSourceShellModel'
import type { AgentComposerQueuedInput } from '@/features/agent/application/useAgentChatTurnControls'
import type { AgentChatDataSourceShellLoadResult } from '@/features/agent/application/agentChatDataSourceShellTypes'

interface MutableRefValue<T> {
  current: T
}

interface UseAgentChatDataSourceLoadEffectInput {
  activeThreadIdRef: MutableRefValue<string | null>
  dispatchRuntime: Dispatch<AgentChatRuntimeAction>
  loadDataSourceRef: MutableRefValue<() => Promise<AgentChatDataSourceShellLoadResult>>
  readRestorableActiveThreadId: () => string | null
  recentCapabilityEventSequenceRef: MutableRefValue<number>
  resetThreadListFromCache: () => void
  setDataSource: Dispatch<SetStateAction<AgentChatDataSource | undefined>>
  setEndpoint: Dispatch<SetStateAction<string | undefined>>
  setError: Dispatch<SetStateAction<string | null>>
  setLoading: Dispatch<SetStateAction<boolean>>
  setQueuedInputs: Dispatch<SetStateAction<AgentComposerQueuedInput[]>>
  setSending: Dispatch<SetStateAction<boolean>>
  setStoppingTurn: Dispatch<SetStateAction<boolean>>
}

export function useAgentChatDataSourceLoadEffect({
  activeThreadIdRef,
  dispatchRuntime,
  loadDataSourceRef,
  readRestorableActiveThreadId,
  recentCapabilityEventSequenceRef,
  resetThreadListFromCache,
  setDataSource,
  setEndpoint,
  setError,
  setLoading,
  setQueuedInputs,
  setSending,
  setStoppingTurn,
}: UseAgentChatDataSourceLoadEffectInput) {
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setDataSource(undefined)
    setEndpoint(undefined)
    recentCapabilityEventSequenceRef.current = 0
    setSending(false)
    setQueuedInputs([])
    setStoppingTurn(false)
    resetThreadListFromCache()
    const storedThreadId = readRestorableActiveThreadId()
    activeThreadIdRef.current = storedThreadId
    dispatchRuntime({ type: 'reset', activeThreadId: storedThreadId })
    void loadDataSourceRef.current()
      .then((result) => {
        if (cancelled) return
        setDataSource(result.dataSource)
        setEndpoint(result.endpoint)
        if (!result.dataSource) setLoading(false)
      })
      .catch((nextError) => {
        if (cancelled) return
        setError(errorMessage(nextError))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [
    activeThreadIdRef,
    dispatchRuntime,
    loadDataSourceRef,
    readRestorableActiveThreadId,
    recentCapabilityEventSequenceRef,
    resetThreadListFromCache,
    setDataSource,
    setEndpoint,
    setError,
    setLoading,
    setQueuedInputs,
    setSending,
    setStoppingTurn,
  ])
}
