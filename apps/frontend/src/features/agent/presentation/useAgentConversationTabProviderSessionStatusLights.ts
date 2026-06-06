import { useEffect, useMemo, useRef } from 'react'
import {
  STOPPED_PROVIDER_SESSION_STATUS_LIGHT,
  type ProviderSessionStatusLight,
} from '@/features/agent/domain/providerSessionStatusLight'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import type { Conversation } from '@/features/agent/state/agentStore'
import {
  providerSessionStatusLightController,
  providerSessionStatusLightTargetKeys,
  providerSessionStatusLightTargetsSignature,
  useProviderSessionStatusLightStore,
  type ProviderSessionStatusLightWatchTarget,
} from '@/features/agent/presentation/providerSessionStatusLightController'

let nextProviderSessionStatusLightOwnerId = 0

export function useAgentConversationTabProviderSessionStatusLights(conversations: Conversation[]): Record<string, ProviderSessionStatusLight> {
  const providerThreadIdsByConversation = useAgentSessionStore((state) => state.providerThreadIdsByConversation)
  const sessionIdsByConversation = useAgentSessionStore((state) => state.sessionIdsByConversation)
  const tabProviderSessionTargets = useMemo(() => buildAgentConversationTabProviderSessionTargets({
    conversations,
    providerThreadIdsByConversation,
    sessionIdsByConversation,
  }), [conversations, providerThreadIdsByConversation, sessionIdsByConversation])
  const targetSignature = useMemo(() => providerSessionStatusLightTargetsSignature(tabProviderSessionTargets), [tabProviderSessionTargets])
  const targetsRef = useRef(tabProviderSessionTargets)
  targetsRef.current = tabProviderSessionTargets
  const ownerIdRef = useRef<string>()
  if (!ownerIdRef.current) {
    nextProviderSessionStatusLightOwnerId += 1
    ownerIdRef.current = `conversation-tab-provider-session-status-lights:${nextProviderSessionStatusLightOwnerId}`
  }
  const providerSessionStatusLightsByTarget = useProviderSessionStatusLightStore((state) => state.providerSessionStatusLightsByTarget)

  useEffect(() => {
    providerSessionStatusLightController.setOwnerTargets(ownerIdRef.current!, targetsRef.current)
  }, [targetSignature])

  useEffect(() => {
    return () => {
      providerSessionStatusLightController.clearOwnerTargets(ownerIdRef.current!)
    }
  }, [])

  return useMemo(() => {
    const statusLights: Record<string, ProviderSessionStatusLight> = {}
    for (const target of tabProviderSessionTargets) {
      const targetKeys = providerSessionStatusLightTargetKeys(target)
      statusLights[target.conversationId] = providerSessionStatusLightForTargetKeys(providerSessionStatusLightsByTarget, targetKeys)
    }
    return statusLights
  }, [providerSessionStatusLightsByTarget, tabProviderSessionTargets])
}

export function providerSessionStatusLightForTargetKeys(
  providerSessionStatusLightsByTarget: Record<string, ProviderSessionStatusLight>,
  targetKeys: string[],
): ProviderSessionStatusLight {
  const lights = targetKeys
    .map((targetKey) => providerSessionStatusLightsByTarget[targetKey])
    .filter((light): light is ProviderSessionStatusLight => Boolean(light))
  return lights.find((light) => light.state !== 'stopped') ?? lights[0] ?? STOPPED_PROVIDER_SESSION_STATUS_LIGHT
}

export interface AgentConversationTabProviderSessionTarget extends ProviderSessionStatusLightWatchTarget {
  conversationId: string
  sessionId?: string
  threadId: string
}

export function buildAgentConversationTabProviderSessionTargets(input: {
  conversations: Conversation[]
  providerThreadIdsByConversation: Record<string, string>
  sessionIdsByConversation: Record<string, string>
}): AgentConversationTabProviderSessionTarget[] {
  return input.conversations.map((conversation) => {
    const sessionId = (input.sessionIdsByConversation[conversation.id] ?? conversation.providerSessionId ?? '').trim()
    const threadId = (input.providerThreadIdsByConversation[conversation.id] ?? conversation.providerThreadId ?? '').trim()
    return {
      conversationId: conversation.id,
      ...(sessionId ? { sessionId } : {}),
      threadId,
    }
  })
}
