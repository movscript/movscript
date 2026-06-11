import { useEffect, useMemo, useRef } from 'react'
import {
  providerSessionStatusLightForTargetKeys as coreProviderSessionStatusLightForTargetKeys,
  type ProviderSessionStatusLight,
} from '@movscript/core/agent'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import type { Conversation } from '@/features/agent/state/agentStore'
import type { AgentConversationThreadBinding } from '@/features/agent/state/agentSessionStore'
import { STOPPED_PROVIDER_SESSION_STATUS_LIGHT } from '@/features/agent/presentation/providerSessionStatusLightFallback'
import {
  providerSessionStatusLightController,
  providerSessionStatusLightTargetKeys,
  providerSessionStatusLightTargetsSignature,
  useProviderSessionStatusLightStore,
  type ProviderSessionStatusLightWatchTarget,
} from '@/features/agent/presentation/providerSessionStatusLightController'

let nextProviderSessionStatusLightOwnerId = 0

export function useAgentConversationTabProviderSessionStatusLights(conversations: Conversation[]): Record<string, ProviderSessionStatusLight> {
  const conversationThreadBindings = useAgentSessionStore((state) => state.conversationThreadBindings)
  const tabProviderSessionTargets = useMemo(() => buildAgentConversationTabProviderSessionTargets({
    conversations,
    conversationThreadBindings,
  }), [conversationThreadBindings, conversations])
  const targetSignature = useMemo(() => providerSessionStatusLightTargetsSignature(tabProviderSessionTargets), [tabProviderSessionTargets])
  const targetsRef = useRef(tabProviderSessionTargets)
  targetsRef.current = tabProviderSessionTargets
  const ownerIdRef = useRef<string | undefined>(undefined)
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
  targetKeys: readonly string[],
): ProviderSessionStatusLight {
  return coreProviderSessionStatusLightForTargetKeys(
    providerSessionStatusLightsByTarget,
    targetKeys,
    STOPPED_PROVIDER_SESSION_STATUS_LIGHT,
  )
}

export interface AgentConversationTabProviderSessionTarget extends ProviderSessionStatusLightWatchTarget {
  conversationId: string
  sessionId?: string
  threadId: string
}

export function buildAgentConversationTabProviderSessionTargets(input: {
  conversations: Conversation[]
  conversationThreadBindings?: Record<string, AgentConversationThreadBinding>
}): AgentConversationTabProviderSessionTarget[] {
  return input.conversations.map((conversation) => {
    const binding = input.conversationThreadBindings?.[conversation.id]
    const sessionId = (binding?.providerSessionTreeId ?? conversation.providerSessionId ?? '').trim()
    const threadId = (binding?.providerThreadId ?? conversation.providerThreadId ?? '').trim()
    return {
      conversationId: conversation.id,
      ...(sessionId ? { sessionId } : {}),
      threadId,
    }
  })
}
