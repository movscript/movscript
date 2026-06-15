import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import {
  buildAgentChatRuntimeThreadReadInput,
  type AgentChatDataSource,
  type AgentChatRuntimeAction,
  type AgentChatRuntimeState,
  type AgentChatThread,
  type AgentChatThreadReadInput,
} from '@movscript/core/agent/chat'
import {
  errorMessage,
  isUnavailableThreadReadError,
  provisionalAgentChatThread,
  selectAgentChatInitialSourceThread,
} from '@/features/agent/presentation/agentChatDataSourceShellModel'

interface UseAgentChatThreadBootstrapInput {
  clearUnavailableActiveThread: (threadId: string) => void
  clearUnavailableStoredThread: (threadId: string) => boolean
  closedThreadIds: Set<string>
  dataSource?: AgentChatDataSource
  dispatchRuntime: Dispatch<AgentChatRuntimeAction>
  fetchFirstThreadListPage: () => Promise<AgentChatThread[]>
  markThreadOpen: (threadId: string) => void
  readRestorableActiveThreadId: () => string | null
  registerThreadConversation: (thread: AgentChatThread) => void
  runtimeRef: MutableRefObject<AgentChatRuntimeState>
  setActiveThreadIdValue: (threadId: string | null) => void
  setError: Dispatch<SetStateAction<string | null>>
  setHistoryOpen: Dispatch<SetStateAction<boolean>>
  setLoading: Dispatch<SetStateAction<boolean>>
  upsertThreadReadResult: (thread: AgentChatThread, input: AgentChatThreadReadInput) => void
}

export function useAgentChatThreadBootstrap({
  clearUnavailableActiveThread,
  clearUnavailableStoredThread,
  closedThreadIds,
  dataSource,
  dispatchRuntime,
  fetchFirstThreadListPage,
  markThreadOpen,
  readRestorableActiveThreadId,
  registerThreadConversation,
  runtimeRef,
  setActiveThreadIdValue,
  setError,
  setHistoryOpen,
  setLoading,
  upsertThreadReadResult,
}: UseAgentChatThreadBootstrapInput) {
  const readHistoryThread = useCallback(async (threadId: string) => {
    if (!dataSource) throw new Error('Agent data source is not available')
    const input = buildAgentChatRuntimeThreadReadInput(runtimeRef.current, threadId)
    const thread = await dataSource.readThread(threadId, input)
    return { thread, input }
  }, [dataSource, runtimeRef])

  const loadThreads = useCallback(async () => {
    if (!dataSource) return
    setLoading(true)
    setError(null)
    try {
      const nextThreads = await fetchFirstThreadListPage()
      const stored = readRestorableActiveThreadId()
      if (!stored) {
        const firstOpenThread = selectAgentChatInitialSourceThread({
          closedThreadIds,
          threads: nextThreads,
        })
        if (!firstOpenThread) {
          setActiveThreadIdValue(null)
          return
        }
        setActiveThreadIdValue(firstOpenThread.id)
        markThreadOpen(firstOpenThread.id)
        try {
          const { thread, input } = await readHistoryThread(firstOpenThread.id)
          registerThreadConversation(thread)
          upsertThreadReadResult(thread, input)
        } catch (readError) {
          if (!isUnavailableThreadReadError(readError)) throw readError
          const removedEmptyConversation = clearUnavailableStoredThread(firstOpenThread.id)
          if (removedEmptyConversation) setError(errorMessage(readError))
        }
        return
      }
      setActiveThreadIdValue(stored)
      markThreadOpen(stored)
      try {
        const { thread, input } = await readHistoryThread(stored)
        upsertThreadReadResult(thread, input)
      } catch (readError) {
        if (!isUnavailableThreadReadError(readError)) throw readError
        const removedEmptyConversation = clearUnavailableStoredThread(stored)
        if (removedEmptyConversation) setError(errorMessage(readError))
      }
    } catch (nextError) {
      setError(errorMessage(nextError))
    } finally {
      setLoading(false)
    }
  }, [clearUnavailableStoredThread, closedThreadIds, dataSource, fetchFirstThreadListPage, markThreadOpen, readHistoryThread, readRestorableActiveThreadId, registerThreadConversation, setActiveThreadIdValue, setError, setLoading, upsertThreadReadResult])

  const restoreStoredThread = useCallback(async () => {
    if (!dataSource) return
    const stored = readRestorableActiveThreadId()
    if (!stored) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    setActiveThreadIdValue(stored)
    dispatchRuntime({ type: 'upsertThread', thread: provisionalAgentChatThread(stored, dataSource) })
    try {
      const { thread, input } = await readHistoryThread(stored)
      registerThreadConversation(thread)
      upsertThreadReadResult(thread, input)
    } catch (nextError) {
      if (isUnavailableThreadReadError(nextError)) {
        clearUnavailableStoredThread(stored)
      } else {
        setError(errorMessage(nextError))
      }
    } finally {
      setLoading(false)
    }
  }, [clearUnavailableStoredThread, dataSource, dispatchRuntime, readHistoryThread, readRestorableActiveThreadId, registerThreadConversation, setActiveThreadIdValue, setError, setLoading, upsertThreadReadResult])

  const openThread = useCallback(async (threadId: string) => {
    if (!dataSource) return
    setActiveThreadIdValue(threadId)
    markThreadOpen(threadId)
    setError(null)
    try {
      const { thread, input } = await readHistoryThread(threadId)
      registerThreadConversation(thread)
      upsertThreadReadResult(thread, input)
      setHistoryOpen(false)
    } catch (nextError) {
      if (isUnavailableThreadReadError(nextError)) {
        clearUnavailableActiveThread(threadId)
        dispatchRuntime({ type: 'removeThread', threadId })
      }
      setError(errorMessage(nextError))
    }
  }, [clearUnavailableActiveThread, dataSource, dispatchRuntime, markThreadOpen, readHistoryThread, registerThreadConversation, setActiveThreadIdValue, setError, setHistoryOpen, upsertThreadReadResult])

  return {
    loadThreads,
    openThread,
    readHistoryThread,
    restoreStoredThread,
  }
}
