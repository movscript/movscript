import { useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { fetchResourceById } from '@/features/agent/domain/agentMessageViewModel'
import { loadRuntimeThreadProjection } from '@/features/agent/application/agentRuntimeThreadHydration'
import { hydrateRuntimeThreadConversation } from '@/features/agent/application/agentRuntimeThreadConversationHydration'
import { STOPPED_RUNTIME_STATUS_LIGHT, type AgentRuntimeStatusLight } from '@/features/agent/domain/agentRuntimeStatusLight'
import { localAgentClient, type AgentRun } from '@/shared/infrastructure/localAgentClient'
import { useAgentStore, type ChatMessage } from '@/features/agent/state/agentStore'
import { runtimeThreadProjectionShouldRefresh } from '@movscript/event-state'

export interface UseAgentRuntimeThreadHydrationInput {
  userId: string
  conversationId: string
  conversationMessages: ChatMessage[]
  localSessionId?: string
  localThreadId: string
  loading: boolean
  building: boolean
  runtimeLoading?: boolean
  runtimeBuilding?: boolean
  setLocalThreadId: (conversationId: string, threadId: string) => void
  setConversationSessionId?: (conversationId: string, sessionId: string) => void
  setConversationRuntimeSessionId?: (userId: string, conversationId: string, sessionId: string) => void
  setConversationRuntimeThreadId: (userId: string, conversationId: string, threadId: string) => void
  setConversationRun: (conversationId: string, run: AgentRun, patch?: { loading?: boolean; building?: boolean; approving?: boolean; stopping?: boolean; stopRequested?: boolean }) => void
  setRuntimeThreadProjection: (input: { conversationId: string; threadId: string; sessionId?: string; messages: ChatMessage[] }) => void
  setSubmittedInteractionRuns: Dispatch<SetStateAction<AgentRun[]>>
  setRuntimeStatusLight: (status: AgentRuntimeStatusLight) => void
  updateConversationTitle: (userId: string, conversationId: string, title: string) => void
}

export function useAgentRuntimeThreadHydration({
  userId,
  conversationId,
  conversationMessages,
  localSessionId,
  localThreadId,
  loading,
  building,
  runtimeLoading,
  runtimeBuilding,
  setLocalThreadId,
  setConversationSessionId,
  setConversationRuntimeSessionId,
  setConversationRuntimeThreadId,
  setConversationRun,
  setRuntimeThreadProjection,
  setSubmittedInteractionRuns,
  setRuntimeStatusLight,
  updateConversationTitle,
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
    if (building || runtimeBuilding || loading || runtimeLoading) return
    const controller = new AbortController()
    const existingMessages = useAgentStore.getState().getConversations(userId).find((item) => item.id === conversationId)?.messages ?? conversationMessages
    void hydrateRuntimeThreadConversation({
      userId,
      conversationId,
      threadId,
      ...(localSessionId?.trim() ? { sessionId: localSessionId.trim() } : {}),
      existingMessages,
      hydratedKeys: hydratedRuntimeThreadKeysRef.current,
      signal: controller.signal,
    }, {
      loadProjection: (input) => loadRuntimeThreadProjection({
        threadId: input.threadId,
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        existingMessages: input.existingMessages,
        signal: input.signal,
      }, {
        fetchResourceById,
      }),
      setLocalThreadId,
      setConversationSessionId,
      setConversationRuntimeSessionId,
      setConversationRuntimeThreadId,
      setConversationRun,
      setRuntimeThreadProjection,
      setSubmittedInteractionRuns,
      setRuntimeStatusLight,
      updateConversationTitle,
    }).catch(() => undefined)
    return () => {
      controller.abort()
    }
  }, [
    building,
    conversationId,
    conversationMessages,
    loading,
    localSessionId,
    localThreadId,
    runtimeBuilding,
    runtimeLoading,
    setConversationRuntimeThreadId,
    setConversationSessionId,
    setConversationRuntimeSessionId,
    setConversationRun,
    setRuntimeThreadProjection,
    setSubmittedInteractionRuns,
    setRuntimeStatusLight,
    setLocalThreadId,
    updateConversationTitle,
    userId,
  ])

  useEffect(() => {
    const threadId = localThreadId.trim()
    if (!threadId) return
    if (building || runtimeBuilding || loading || runtimeLoading) return
    const controller = new AbortController()
    const hydrateFromStream = () => {
      if (controller.signal.aborted) return
      const existingMessages = useAgentStore.getState().getConversations(userId).find((item) => item.id === conversationId)?.messages ?? conversationMessages
      void hydrateRuntimeThreadConversation({
        userId,
        conversationId,
        threadId,
        ...(localSessionId?.trim() ? { sessionId: localSessionId.trim() } : {}),
        existingMessages,
        hydratedKeys: hydratedRuntimeThreadKeysRef.current,
        signal: controller.signal,
        force: true,
      }, {
        loadProjection: (input) => loadRuntimeThreadProjection({
          threadId: input.threadId,
          ...(input.sessionId ? { sessionId: input.sessionId } : {}),
          existingMessages: input.existingMessages,
          signal: input.signal,
        }, {
          fetchResourceById,
        }),
        setLocalThreadId,
        setConversationSessionId,
        setConversationRuntimeSessionId,
        setConversationRuntimeThreadId,
        setConversationRun,
        setRuntimeThreadProjection,
       setSubmittedInteractionRuns,
       setRuntimeStatusLight,
       updateConversationTitle,
      }).catch(() => undefined)
    }
    const scheduleHydration = () => {
      if (streamHydrationTimerRef.current) clearTimeout(streamHydrationTimerRef.current)
      streamHydrationTimerRef.current = setTimeout(() => {
        streamHydrationTimerRef.current = null
        hydrateFromStream()
      }, 150)
    }
    const stream = localSessionId?.trim()
      ? localAgentClient.streamSession(localSessionId.trim(), {
        signal: controller.signal,
        onRuntimeEvent: (event) => {
          if (runtimeThreadProjectionShouldRefresh(event)) scheduleHydration()
        },
      })
      : localAgentClient.streamThread(threadId, {
        signal: controller.signal,
        onRuntimeEvent: (event) => {
          if (runtimeThreadProjectionShouldRefresh(event)) scheduleHydration()
        },
      })
    void stream.catch(() => undefined)
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
    localSessionId,
    localThreadId,
    runtimeBuilding,
    runtimeLoading,
    setConversationRuntimeThreadId,
    setConversationSessionId,
    setConversationRuntimeSessionId,
    setConversationRun,
    setRuntimeThreadProjection,
    setSubmittedInteractionRuns,
    setRuntimeStatusLight,
    setLocalThreadId,
    updateConversationTitle,
    userId,
  ])
}
