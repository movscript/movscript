import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import {
  readAgentChatSourceThreadListCache,
  writeAgentChatSourceThreadListCache,
} from '@/features/agent/application/agentChatRuntimeCache'
import {
  errorMessage,
  mergeAgentChatThreadListPage,
} from '@/features/agent/presentation/agentChatDataSourceShellModel'
import type {
  AgentChatDataSource,
  AgentChatThread,
} from '@movscript/agent-chat'

const AGENT_CHAT_THREAD_LIST_PAGE_SIZE = 20

interface UseAgentChatThreadListInput {
  dataSource?: AgentChatDataSource
  setError: Dispatch<SetStateAction<string | null>>
  setLoading: Dispatch<SetStateAction<boolean>>
  threadScopeKey: string
}

export function useAgentChatThreadList({
  dataSource,
  setError,
  setLoading,
  threadScopeKey,
}: UseAgentChatThreadListInput) {
  const [sourceThreadList, setSourceThreadList] = useState<AgentChatThread[]>(() => readAgentChatSourceThreadListCache(threadScopeKey).threads)
  const [sourceThreadListLoaded, setSourceThreadListLoaded] = useState(() => readAgentChatSourceThreadListCache(threadScopeKey).loaded)
  const [threadListNextCursor, setThreadListNextCursor] = useState<string | null>(() => readAgentChatSourceThreadListCache(threadScopeKey).nextCursor)
  const [threadListLoadingMore, setThreadListLoadingMore] = useState(false)

  const resetThreadListFromCache = useCallback(() => {
    const cachedThreadList = readAgentChatSourceThreadListCache(threadScopeKey)
    setSourceThreadList(cachedThreadList.threads)
    setSourceThreadListLoaded(cachedThreadList.loaded)
    setThreadListNextCursor(cachedThreadList.nextCursor)
    setThreadListLoadingMore(false)
  }, [threadScopeKey])

  const writeSourceThreadList = useCallback((threads: AgentChatThread[], nextCursor: string | null) => {
    setSourceThreadList(threads)
    setSourceThreadListLoaded(true)
    setThreadListNextCursor(nextCursor)
    writeAgentChatSourceThreadListCache(threadScopeKey, {
      loaded: true,
      nextCursor,
      threads,
    })
  }, [threadScopeKey])

  const fetchFirstThreadListPage = useCallback(async () => {
    if (!dataSource) return []
    const response = await dataSource.listThreads({ limit: AGENT_CHAT_THREAD_LIST_PAGE_SIZE })
    writeSourceThreadList(response.threads, response.nextCursor ?? null)
    return response.threads
  }, [dataSource, writeSourceThreadList])

  const refreshThreadList = useCallback(async () => {
    if (!dataSource) return
    setLoading(true)
    setError(null)
    try {
      await fetchFirstThreadListPage()
    } catch (nextError) {
      setError(errorMessage(nextError))
    } finally {
      setLoading(false)
    }
  }, [dataSource, fetchFirstThreadListPage, setError, setLoading])

  const loadMoreThreads = useCallback(async () => {
    if (!dataSource || !threadListNextCursor || threadListLoadingMore) return
    setThreadListLoadingMore(true)
    setError(null)
    try {
      const response = await dataSource.listThreads({
        limit: AGENT_CHAT_THREAD_LIST_PAGE_SIZE,
        cursor: threadListNextCursor,
      })
      setThreadListNextCursor(response.nextCursor ?? null)
      setSourceThreadList((current) => {
        const next = mergeAgentChatThreadListPage(current, response.threads)
        writeAgentChatSourceThreadListCache(threadScopeKey, {
          loaded: true,
          nextCursor: response.nextCursor ?? null,
          threads: next,
        })
        return next
      })
      setSourceThreadListLoaded(true)
    } catch (nextError) {
      setError(errorMessage(nextError))
    } finally {
      setThreadListLoadingMore(false)
    }
  }, [dataSource, setError, threadListLoadingMore, threadListNextCursor, threadScopeKey])

  return {
    fetchFirstThreadListPage,
    loadMoreThreads,
    refreshThreadList,
    resetThreadListFromCache,
    sourceThreadList,
    sourceThreadListLoaded,
    threadListLoadingMore,
    threadListNextCursor,
  }
}
