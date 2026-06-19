import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react'
import type { AgentConversationRegistryRecord } from '@movscript/core/agent'
import {
  type AgentChatDataSource,
  type AgentChatRuntimeAction,
  type AgentChatThread,
  type AgentChatThreadReadInput,
} from '@movscript/core/agent/chat'
import {
  agentChatThreadIsRunning,
  buildAgentChatOpenThreadCandidates,
  buildAgentChatProviderIdentity,
  buildAgentChatThreadTabs,
  errorMessage,
  isAgentChatThread,
  positiveInteger,
  resolveAgentChatNextThreadAfterClose,
  selectAgentChatClosedHistoryThreads,
} from '@/features/agent/presentation/agentChatDataSourceShellModel'

interface UseAgentChatThreadTabsInput {
  activeThreadId: string | null
  closedThreadIds: Set<string>
  conversations: AgentConversationRegistryRecord[]
  dataSource?: AgentChatDataSource
  dispatchRuntime: Dispatch<AgentChatRuntimeAction>
  markThreadClosed: (threadId: string, clearActive: boolean) => void
  markThreadOpen: (threadId: string) => void
  openThreadIds: Set<string>
  projectId?: unknown
  providerIdentity: ReturnType<typeof buildAgentChatProviderIdentity>
  readHistoryThread: (threadId: string) => Promise<{ thread: AgentChatThread; input: AgentChatThreadReadInput } | null>
  reorderOpenThreads: (draggedThreadId: string, targetThreadId: string, position: 'before' | 'after') => void
  setActiveThreadIdValue: (threadId: string | null) => void
  setError: Dispatch<SetStateAction<string | null>>
  sourceThreadList: AgentChatThread[]
  syncThreadConversationTitle: (threadId: string, title: string | null | undefined) => void
  threadOrderIndex: Map<string, number>
  threads: AgentChatThread[]
  upsertThread: (thread: AgentChatThread) => void
  upsertThreadReadResult: (thread: AgentChatThread, input: AgentChatThreadReadInput) => void
  userId: string
}

export function useAgentChatThreadTabs({
  activeThreadId,
  closedThreadIds,
  conversations,
  dataSource,
  dispatchRuntime,
  markThreadClosed,
  markThreadOpen,
  openThreadIds,
  projectId,
  providerIdentity,
  readHistoryThread,
  reorderOpenThreads,
  setActiveThreadIdValue,
  setError,
  sourceThreadList,
  syncThreadConversationTitle,
  threadOrderIndex,
  threads,
  upsertThread,
  upsertThreadReadResult,
  userId,
}: UseAgentChatThreadTabsInput) {
  const normalizedProjectId = useMemo(() => positiveInteger(projectId), [projectId])
  const openThreadCandidates = useMemo(() => buildAgentChatOpenThreadCandidates({
    activeThreadId,
    closedThreadIds,
    conversations,
    dataSource,
    openThreadIds,
    projectId: normalizedProjectId,
    providerIdentity,
    sourceThreadList,
    threads,
    userId,
  }), [activeThreadId, closedThreadIds, conversations, dataSource, normalizedProjectId, openThreadIds, providerIdentity, sourceThreadList, threads, userId])

  const closeThreadTab = useCallback(async (threadId: string) => {
    const thread = threads.find((item) => item.id === threadId)
    if (thread && agentChatThreadIsRunning(thread)) {
      setError('Stop the running turn before closing this tab.')
      return
    }
    if (threadId !== activeThreadId) {
      markThreadClosed(threadId, false)
      return
    }

    const nextThread = resolveAgentChatNextThreadAfterClose({
      closingThreadId: threadId,
      openThreadCandidates,
    })

    markThreadClosed(threadId, !nextThread)
    if (!nextThread) {
      setActiveThreadIdValue(null)
      return
    }

    setActiveThreadIdValue(nextThread.id)
    markThreadOpen(nextThread.id)
    setError(null)
    try {
      const result = await readHistoryThread(nextThread.id)
      if (result) upsertThreadReadResult(result.thread, result.input)
    } catch (nextError) {
      setError(errorMessage(nextError))
    }
  }, [activeThreadId, markThreadClosed, markThreadOpen, openThreadCandidates, readHistoryThread, setActiveThreadIdValue, setError, threads, upsertThreadReadResult])

  const reorderThreadTab = useCallback((draggedId: string, targetId: string, position: 'before' | 'after') => {
    reorderOpenThreads(draggedId, targetId, position)
  }, [reorderOpenThreads])

  const renameThread = useCallback(async (threadId: string, name: string) => {
    if (!dataSource?.renameThread) return
    setError(null)
    try {
      const response = await dataSource.renameThread({ threadId, name })
      if (isAgentChatThread(response)) {
        upsertThread(response)
        syncThreadConversationTitle(response.id, response.name ?? name)
      }
      else {
        dispatchRuntime({
          type: 'updateThreads',
          update: (current) => current.map((thread) => thread.id === threadId ? { ...thread, name, updatedAt: Math.floor(Date.now() / 1000) } : thread),
        })
        syncThreadConversationTitle(threadId, name)
      }
    } catch (nextError) {
      setError(errorMessage(nextError))
    }
  }, [dataSource, dispatchRuntime, setError, syncThreadConversationTitle, upsertThread])

  const threadTabs = useMemo(() => buildAgentChatThreadTabs({
    threadOrderIndex,
    threads: openThreadCandidates,
  }).map((thread) => ({
    ...thread,
    ...(dataSource?.renameThread ? { onRename: (name: string) => void renameThread(thread.id, name) } : {}),
  })), [dataSource?.renameThread, openThreadCandidates, renameThread, threadOrderIndex])

  const closedHistoryThreads = useMemo(() => selectAgentChatClosedHistoryThreads({
    closedThreadIds,
    conversations,
    projectId: normalizedProjectId,
    sourceThreadList,
  }), [closedThreadIds, conversations, normalizedProjectId, sourceThreadList])

  return {
    closeThreadTab,
    closedHistoryThreads,
    reorderThreadTab,
    threadTabs,
  }
}
