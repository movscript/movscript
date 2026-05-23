import { useEffect, useMemo, useState } from 'react'
import {
  STOPPED_RUNTIME_STATUS_LIGHT,
  runtimeStatusLightFromThreadRuntimeSnapshot,
  type AgentRuntimeStatusLight,
} from '@/lib/agentRuntimeStatusLight'
import { localAgentClient } from '@/lib/localAgentClient'
import { useAgentSessionStore } from '@/store/agentSessionStore'
import type { Conversation } from '@/store/agentStore'
import { runtimeThreadProjectionShouldRefresh } from '@movscript/event-state'

export function useAgentConversationTabRuntimeStatusLights(conversations: Conversation[]): Record<string, AgentRuntimeStatusLight> {
  const localThreadIdsByConversation = useAgentSessionStore((state) => state.localThreadIdsByConversation)
  const sessionIdsByConversation = useAgentSessionStore((state) => state.sessionIdsByConversation)
  const tabRuntimeTargets = useMemo(() => buildAgentConversationTabRuntimeTargets({
    conversations,
    localThreadIdsByConversation,
    sessionIdsByConversation,
  }), [conversations, localThreadIdsByConversation, sessionIdsByConversation])
  const [statusLights, setStatusLights] = useState<Record<string, AgentRuntimeStatusLight>>({})

  useEffect(() => {
    let cancelled = false
    const controllers: AbortController[] = []

    setStatusLights((current) => {
      const next: Record<string, AgentRuntimeStatusLight> = {}
      for (const target of tabRuntimeTargets) {
        next[target.conversationId] = current[target.conversationId] ?? STOPPED_RUNTIME_STATUS_LIGHT
      }
      return next
    })

    const updateStatusLight = (conversationId: string, statusLight: AgentRuntimeStatusLight) => {
      if (cancelled) return
      setStatusLights((current) => {
        const existing = current[conversationId]
        if (existing?.state === statusLight.state && existing.label === statusLight.label && existing.detail === statusLight.detail) return current
        return { ...current, [conversationId]: statusLight }
      })
    }

    for (const target of tabRuntimeTargets) {
      if (!target.sessionId && !target.threadId) {
        updateStatusLight(target.conversationId, STOPPED_RUNTIME_STATUS_LIGHT)
        continue
      }

      const controller = new AbortController()
      controllers.push(controller)
      const refresh = () => {
        const snapshot = target.sessionId
          ? localAgentClient.getSessionRuntime(target.sessionId, controller.signal)
          : localAgentClient.getThreadRuntime(target.threadId, controller.signal)
        void snapshot
          .then((snapshot) => updateStatusLight(target.conversationId, runtimeStatusLightFromThreadRuntimeSnapshot(snapshot)))
          .catch(() => {
            if (!controller.signal.aborted) updateStatusLight(target.conversationId, STOPPED_RUNTIME_STATUS_LIGHT)
          })
      }
      refresh()
      const stream = target.sessionId
        ? localAgentClient.streamSession(target.sessionId, {
          signal: controller.signal,
          onRuntimeEvent: (event) => {
            if (runtimeThreadProjectionShouldRefresh(event)) refresh()
          },
        })
        : localAgentClient.streamThread(target.threadId, {
          signal: controller.signal,
          onRuntimeEvent: (event) => {
            if (runtimeThreadProjectionShouldRefresh(event)) refresh()
          },
        })
      void stream.catch(() => undefined)
    }

    return () => {
      cancelled = true
      for (const controller of controllers) controller.abort()
    }
  }, [tabRuntimeTargets])

  return statusLights
}

export interface AgentConversationTabRuntimeTarget {
  conversationId: string
  sessionId?: string
  threadId: string
}

export function buildAgentConversationTabRuntimeTargets(input: {
  conversations: Conversation[]
  localThreadIdsByConversation: Record<string, string>
  sessionIdsByConversation: Record<string, string>
}): AgentConversationTabRuntimeTarget[] {
  return input.conversations.map((conversation) => {
    const sessionId = (input.sessionIdsByConversation[conversation.id] ?? conversation.runtimeSessionId ?? '').trim()
    const threadId = (input.localThreadIdsByConversation[conversation.id] ?? conversation.runtimeThreadId ?? '').trim()
    return {
      conversationId: conversation.id,
      ...(sessionId ? { sessionId } : {}),
      threadId,
    }
  })
}
