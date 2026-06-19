import { useEffect, type Dispatch } from 'react'
import { debugAgentChatShellLoad } from '@/features/agent/application/agentChatShellDebug'
import type {
  AgentChatDataSource,
  AgentChatNotification,
  AgentChatRuntimeAction,
  AgentChatRuntimePendingServerRequest,
  AgentChatThread,
} from '@movscript/core/agent/chat'

interface MutableRefValue<T> {
  current: T
}

type AgentChatServerRequestHandler = NonNullable<Parameters<NonNullable<AgentChatDataSource['subscribeThread']>>[0]['onServerRequest']>

interface UseAgentChatThreadLifecycleEffectsInput {
  activeThread: AgentChatThread | null
  activeThreadId: string | null
  autoLoadThreads: boolean
  dataSource?: AgentChatDataSource
  dispatchRuntime: Dispatch<AgentChatRuntimeAction>
  handleNotification: (notification: AgentChatNotification) => void
  handleServerRequest: AgentChatServerRequestHandler
  historyOpen: boolean
  loadThreads: () => Promise<void>
  loadThreadsRef: MutableRefValue<() => Promise<void>>
  loading: boolean
  refreshThreadList: () => Promise<void>
  restoreStoredThread: () => Promise<void>
  restoreStoredThreadRef: MutableRefValue<() => Promise<void>>
  showThreadList: boolean
  sourceThreadListLoaded: boolean
  surface: 'panel' | 'page'
  threadScopeKey: string
  visiblePendingServerRequests: AgentChatRuntimePendingServerRequest[]
}

export function useAgentChatThreadLifecycleEffects({
  activeThread,
  activeThreadId,
  autoLoadThreads,
  dataSource,
  dispatchRuntime,
  handleNotification,
  handleServerRequest,
  historyOpen,
  loadThreads,
  loadThreadsRef,
  loading,
  refreshThreadList,
  restoreStoredThread,
  restoreStoredThreadRef,
  showThreadList,
  sourceThreadListLoaded,
  surface,
  threadScopeKey,
  visiblePendingServerRequests,
}: UseAgentChatThreadLifecycleEffectsInput) {
  useEffect(() => {
    loadThreadsRef.current = loadThreads
  }, [loadThreads, loadThreadsRef])

  useEffect(() => {
    restoreStoredThreadRef.current = restoreStoredThread
  }, [restoreStoredThread, restoreStoredThreadRef])

  useEffect(() => {
    if (!dataSource || surface !== 'panel' || !historyOpen || sourceThreadListLoaded || loading) return
    void refreshThreadList()
  }, [dataSource, historyOpen, loading, refreshThreadList, sourceThreadListLoaded, surface])

  useEffect(() => {
    debugAgentChatShellLoad('thread-load-effect', {
      autoLoadThreads,
      hasDataSource: Boolean(dataSource),
      threadScopeKey,
      surface,
      showThreadList,
    })
    if (autoLoadThreads) {
      void loadThreadsRef.current()
      return
    }
    void restoreStoredThreadRef.current()
  }, [autoLoadThreads, dataSource, loadThreadsRef, restoreStoredThreadRef, showThreadList, surface, threadScopeKey])

  useEffect(() => {
    if (!dataSource || !activeThreadId || !dataSource.subscribeThread) return undefined
    const controller = new AbortController()
    let dispose: (() => void) | undefined
    const threadSubscriptionOwnsNotifications = !dataSource.subscribeServerRequests
    void Promise.resolve(dataSource.subscribeThread({
      threadId: activeThreadId,
      signal: controller.signal,
      onNotification: threadSubscriptionOwnsNotifications ? handleNotification : undefined,
      onServerRequest: threadSubscriptionOwnsNotifications ? handleServerRequest : undefined,
    })).then((cleanup) => {
      if (typeof cleanup === 'function') dispose = cleanup
    })
    return () => {
      controller.abort()
      dispose?.()
    }
  }, [activeThreadId, dataSource, handleNotification, handleServerRequest])

  useEffect(() => {
    if (!dataSource || !activeThreadId || activeThread || visiblePendingServerRequests.length === 0) return
    dispatchRuntime({ type: 'requestThreadRead', threadId: activeThreadId })
  }, [activeThread, activeThreadId, dataSource, dispatchRuntime, visiblePendingServerRequests.length])
}
