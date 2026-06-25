import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { AgentChatDataSource } from '@movscript/agent-chat'

interface UseAgentChatRegistryActiveThreadEffectInput {
  activeThreadId: string | null
  activeThreadIdRef: MutableRefObject<string | null>
  dataSource?: AgentChatDataSource
  openThread: (threadId: string) => Promise<void>
  registryActiveThreadId?: string | null
  setActiveThreadIdValue: (threadId: string | null) => void
  setError: Dispatch<SetStateAction<string | null>>
}

export function useAgentChatRegistryActiveThreadEffect({
  activeThreadId,
  activeThreadIdRef,
  dataSource,
  openThread,
  registryActiveThreadId,
  setActiveThreadIdValue,
  setError,
}: UseAgentChatRegistryActiveThreadEffectInput): void {
  useEffect(() => {
    if (!dataSource) return
    if (registryActiveThreadId === activeThreadId) return
    if (registryActiveThreadId === activeThreadIdRef.current) return
    if (registryActiveThreadId) {
      void openThread(registryActiveThreadId)
      return
    }
    setActiveThreadIdValue(null)
    setError(null)
  }, [activeThreadId, activeThreadIdRef, dataSource, openThread, registryActiveThreadId, setActiveThreadIdValue, setError])
}
