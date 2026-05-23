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
  const tabRuntimeTargets = useMemo(() => conversations.map((conversation) => ({
    conversationId: conversation.id,
    threadId: (localThreadIdsByConversation[conversation.id] ?? conversation.runtimeThreadId ?? '').trim(),
  })), [conversations, localThreadIdsByConversation])
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
      if (!target.threadId) {
        updateStatusLight(target.conversationId, STOPPED_RUNTIME_STATUS_LIGHT)
        continue
      }

      const controller = new AbortController()
      controllers.push(controller)
      const refresh = () => {
        void localAgentClient.getThreadRuntime(target.threadId, controller.signal)
          .then((snapshot) => updateStatusLight(target.conversationId, runtimeStatusLightFromThreadRuntimeSnapshot(snapshot)))
          .catch(() => {
            if (!controller.signal.aborted) updateStatusLight(target.conversationId, STOPPED_RUNTIME_STATUS_LIGHT)
          })
      }
      refresh()
      void localAgentClient.streamThread(target.threadId, {
        signal: controller.signal,
        onRuntimeEvent: (event) => {
          if (runtimeThreadProjectionShouldRefresh(event)) refresh()
        },
      }).catch(() => undefined)
    }

    return () => {
      cancelled = true
      for (const controller of controllers) controller.abort()
    }
  }, [tabRuntimeTargets])

  return statusLights
}
