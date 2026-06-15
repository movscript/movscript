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
  projectId?: number
  providerIdentity: ReturnType<typeof buildAgentChatProviderIdentity>
  readHistoryThread: (threadId: string) => Promise<{ thread: AgentChatThread; input: AgentChatThreadReadInput }>
  setActiveThreadIdValue: (threadId: string | null) => void
  setError: Dispatch<SetStateAction<string | null>>
  sourceThreadList: AgentChatThread[]
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
  setActiveThreadIdValue,
  setError,
  sourceThreadList,
  threadOrderIndex,
  threads,
  upsertThread,
  upsertThreadReadResult,
  userId,
}: UseAgentChatThreadTabsInput) {
  const openThreadCandidates = useMemo(() => buildAgentChatOpenThreadCandidates({
    activeThreadId,
    closedThreadIds,
    conversations,
    dataSource,
    openThreadIds,
    projectId,
    providerIdentity,
    sourceThreadList,
    threads,
    userId,
  }), [activeThreadId, closedThreadIds, conversations, dataSource, openThreadIds, projectId, providerIdentity, sourceThreadList, threads, userId])

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
      const { thread: nextThreadResult, input } = await readHistoryThread(nextThread.id)
      upsertThreadReadResult(nextThreadResult, input)
    } catch (nextError) {
      setError(errorMessage(nextError))
    }
  }, [activeThreadId, markThreadClosed, markThreadOpen, openThreadCandidates, readHistoryThread, setActiveThreadIdValue, setError, threads, upsertThreadReadResult])

  const reorderThreadTab = useCallback((_draggedId: string, _targetId: string, _position: 'before' | 'after') => {
    // Tab order is registry-derived. Drag persistence belongs in the core registry once product sorting rules are finalized.
  }, [])

  const renameThread = useCallback(async (threadId: string, name: string) => {
    if (!dataSource?.renameThread) return
    setError(null)
    try {
      const response = await dataSource.renameThread({ threadId, name })
      if (isAgentChatThread(response)) upsertThread(response)
      else {
        dispatchRuntime({
          type: 'updateThreads',
          update: (current) => current.map((thread) => thread.id === threadId ? { ...thread, name, updatedAt: Date.now() } : thread),
        })
      }
    } catch (nextError) {
      setError(errorMessage(nextError))
    }
  }, [dataSource, dispatchRuntime, setError, upsertThread])

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
    projectId,
    sourceThreadList,
  }), [closedThreadIds, conversations, projectId, sourceThreadList])

  return {
    closeThreadTab,
    closedHistoryThreads,
    reorderThreadTab,
    threadTabs,
  }
}
