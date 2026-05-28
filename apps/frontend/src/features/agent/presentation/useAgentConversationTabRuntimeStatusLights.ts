import { useEffect, useMemo, useRef } from 'react'
import {
  STOPPED_RUNTIME_STATUS_LIGHT,
  type AgentRuntimeStatusLight,
} from '@/features/agent/domain/agentRuntimeStatusLight'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import type { Conversation } from '@/features/agent/state/agentStore'
import {
  agentRuntimeStatusLightController,
  runtimeStatusLightTargetKey,
  runtimeStatusLightTargetsSignature,
  useAgentRuntimeStatusLightStore,
  type AgentRuntimeStatusLightWatchTarget,
} from '@/features/agent/presentation/agentRuntimeStatusLightController'

let nextRuntimeStatusLightOwnerId = 0

export function useAgentConversationTabRuntimeStatusLights(conversations: Conversation[]): Record<string, AgentRuntimeStatusLight> {
  const localThreadIdsByConversation = useAgentSessionStore((state) => state.localThreadIdsByConversation)
  const sessionIdsByConversation = useAgentSessionStore((state) => state.sessionIdsByConversation)
  const tabRuntimeTargets = useMemo(() => buildAgentConversationTabRuntimeTargets({
    conversations,
    localThreadIdsByConversation,
    sessionIdsByConversation,
  }), [conversations, localThreadIdsByConversation, sessionIdsByConversation])
  const targetSignature = useMemo(() => runtimeStatusLightTargetsSignature(tabRuntimeTargets), [tabRuntimeTargets])
  const targetsRef = useRef(tabRuntimeTargets)
  targetsRef.current = tabRuntimeTargets
  const ownerIdRef = useRef<string>()
  if (!ownerIdRef.current) {
    nextRuntimeStatusLightOwnerId += 1
    ownerIdRef.current = `conversation-tab-runtime-status-lights:${nextRuntimeStatusLightOwnerId}`
  }
  const runtimeStatusLightsByTarget = useAgentRuntimeStatusLightStore((state) => state.runtimeStatusLightsByTarget)

  useEffect(() => {
    agentRuntimeStatusLightController.setOwnerTargets(ownerIdRef.current!, targetsRef.current)
  }, [targetSignature])

  useEffect(() => {
    return () => {
      agentRuntimeStatusLightController.clearOwnerTargets(ownerIdRef.current!)
    }
  }, [])

  return useMemo(() => {
    const statusLights: Record<string, AgentRuntimeStatusLight> = {}
    for (const target of tabRuntimeTargets) {
      const targetKey = runtimeStatusLightTargetKey(target)
      statusLights[target.conversationId] = targetKey
        ? runtimeStatusLightsByTarget[targetKey] ?? STOPPED_RUNTIME_STATUS_LIGHT
        : STOPPED_RUNTIME_STATUS_LIGHT
    }
    return statusLights
  }, [runtimeStatusLightsByTarget, tabRuntimeTargets])
}

export interface AgentConversationTabRuntimeTarget extends AgentRuntimeStatusLightWatchTarget {
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
