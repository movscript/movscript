import { useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { fetchResourceById } from '@/lib/agentMessageViewModel'
import type { AgentConversationMessageStore } from '@movscript/conversation'
import { loadRuntimeThreadProjection } from '@/lib/agentRuntimeThreadHydration'
import { hydrateRuntimeThreadConversation } from '@/lib/agentRuntimeThreadConversationHydration'
import { STOPPED_RUNTIME_STATUS_LIGHT, type AgentRuntimeStatusLight } from '@/lib/agentRuntimeStatusLight'
import { localAgentClient, type AgentRun } from '@/lib/localAgentClient'
import { useAgentStore, type ChatMessage, type ChatMessageMeta } from '@/store/agentStore'
import { runtimeThreadProjectionShouldRefresh } from '@movscript/event-state'

export interface UseAgentRuntimeThreadHydrationInput {
  userId: string
  conversationId: string
  conversationMessages: ChatMessage[]
  localThreadId: string
  loading: boolean
  building: boolean
  runtimeLoading?: boolean
  runtimeBuilding?: boolean
  setLocalThreadId: (conversationId: string, threadId: string) => void
  setConversationRuntimeThreadId: (userId: string, conversationId: string, threadId: string) => void
  setConversationRun: (conversationId: string, run: AgentRun, patch?: { loading?: boolean; building?: boolean; approving?: boolean; stopping?: boolean; stopRequested?: boolean }) => void
  setSubmittedInteractionRuns: Dispatch<SetStateAction<AgentRun[]>>
  setRuntimeStatusLight: (status: AgentRuntimeStatusLight) => void
  updateConversationTitle: (userId: string, conversationId: string, title: string) => void
  messageStore: Pick<AgentConversationMessageStore<ChatMessage, ChatMessageMeta>, 'setConversationMessages'>
}

export function useAgentRuntimeThreadHydration({
  userId,
  conversationId,
  conversationMessages,
  localThreadId,
  loading,
  building,
  runtimeLoading,
  runtimeBuilding,
  setLocalThreadId,
  setConversationRuntimeThreadId,
  setConversationRun,
  setSubmittedInteractionRuns,
  setRuntimeStatusLight,
  updateConversationTitle,
  messageStore,
}: UseAgentRuntimeThreadHydrationInput) {
  const hydratedRuntimeThreadKeysRef = useRef<Set<string>>(new Set())
  const streamHydrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (localThreadId.trim()) return
    setRuntimeStatusLight(STOPPED_RUNTIME_STATUS_LIGHT)
  }, [localThreadId, setRuntimeStatusLight])

  useEffect(() => {
    const threadId = localThreadId.trim()
    if (!threadId) return
    if (building || runtimeBuilding) return
    const controller = new AbortController()
    const existingMessages = useAgentStore.getState().getConversations(userId).find((item) => item.id === conversationId)?.messages ?? conversationMessages
    void hydrateRuntimeThreadConversation({
      userId,
      conversationId,
      threadId,
      existingMessages,
      hydratedKeys: hydratedRuntimeThreadKeysRef.current,
      signal: controller.signal,
    }, {
      loadProjection: (input) => loadRuntimeThreadProjection({
        threadId: input.threadId,
        existingMessages: input.existingMessages,
        signal: input.signal,
      }, {
        fetchResourceById,
      }),
      setLocalThreadId,
      setConversationRuntimeThreadId,
      setConversationRun,
      setSubmittedInteractionRuns,
      setRuntimeStatusLight,
      updateConversationTitle,
      messageStore,
    }).catch(() => undefined)
    return () => {
      controller.abort()
    }
  }, [
    building,
    conversationId,
    conversationMessages,
    loading,
    localThreadId,
    messageStore,
    runtimeBuilding,
    runtimeLoading,
    setConversationRuntimeThreadId,
    setConversationRun,
    setSubmittedInteractionRuns,
    setRuntimeStatusLight,
    setLocalThreadId,
    updateConversationTitle,
    userId,
  ])

  useEffect(() => {
    const threadId = localThreadId.trim()
    if (!threadId) return
    if (building || runtimeBuilding) return
    const controller = new AbortController()
    const hydrateFromStream = () => {
      if (controller.signal.aborted) return
      const existingMessages = useAgentStore.getState().getConversations(userId).find((item) => item.id === conversationId)?.messages ?? conversationMessages
      void hydrateRuntimeThreadConversation({
        userId,
        conversationId,
        threadId,
        existingMessages,
        hydratedKeys: hydratedRuntimeThreadKeysRef.current,
        signal: controller.signal,
        force: true,
      }, {
        loadProjection: (input) => loadRuntimeThreadProjection({
          threadId: input.threadId,
          existingMessages: input.existingMessages,
          signal: input.signal,
        }, {
          fetchResourceById,
        }),
        setLocalThreadId,
        setConversationRuntimeThreadId,
        setConversationRun,
        setSubmittedInteractionRuns,
        setRuntimeStatusLight,
        updateConversationTitle,
        messageStore,
      }).catch(() => undefined)
    }
    const scheduleHydration = () => {
      if (streamHydrationTimerRef.current) clearTimeout(streamHydrationTimerRef.current)
      streamHydrationTimerRef.current = setTimeout(() => {
        streamHydrationTimerRef.current = null
        hydrateFromStream()
      }, 150)
    }
    void localAgentClient.streamThread(threadId, {
      signal: controller.signal,
      onRuntimeEvent: (event) => {
        if (runtimeThreadProjectionShouldRefresh(event)) scheduleHydration()
      },
    }).catch(() => undefined)
    return () => {
      controller.abort()
      if (streamHydrationTimerRef.current) {
        clearTimeout(streamHydrationTimerRef.current)
        streamHydrationTimerRef.current = null
      }
    }
  }, [
    building,
    conversationId,
    conversationMessages,
    loading,
    localThreadId,
    messageStore,
    runtimeBuilding,
    runtimeLoading,
    setConversationRuntimeThreadId,
    setConversationRun,
    setSubmittedInteractionRuns,
    setRuntimeStatusLight,
    setLocalThreadId,
    updateConversationTitle,
    userId,
  ])
}
