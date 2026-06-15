import { useEffect, useMemo, useRef } from 'react'
import {
  providerSessionStatusLightForTargetKeys as coreProviderSessionStatusLightForTargetKeys,
  type AgentConversationRegistryRecord,
  type ProviderSessionStatusLight,
} from '@movscript/core/agent'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import type { Conversation } from '@/features/agent/state/agentStore'
import type { AgentConversationRuntimeState, AgentConversationThreadBinding } from '@/features/agent/state/agentSessionStore'
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
  const conversationsById = useAgentSessionStore((state) => state.conversationsById)
  const conversationRuntimeStates = useAgentSessionStore((state) => state.conversationRuntimeStates)
  const tabProviderSessionTargets = useMemo(() => buildAgentConversationTabProviderSessionTargets({
    conversations,
    conversationThreadBindings,
    conversationsById,
  }), [conversationThreadBindings, conversations, conversationsById])
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
      const localLight = providerSessionStatusLightFromConversationState(
        conversationsById[target.conversationId],
        conversationRuntimeStates[target.conversationId],
      )
      if (localLight?.terminal) {
        statusLights[target.conversationId] = localLight.light
        continue
      }
      statusLights[target.conversationId] = providerSessionStatusLightForTargetKeys(
        providerSessionStatusLightsByTarget,
        targetKeys,
        localLight?.light,
      )
    }
    return statusLights
  }, [conversationRuntimeStates, conversationsById, providerSessionStatusLightsByTarget, tabProviderSessionTargets])
}

export function providerSessionStatusLightForTargetKeys(
  providerSessionStatusLightsByTarget: Record<string, ProviderSessionStatusLight>,
  targetKeys: readonly string[],
  fallback: ProviderSessionStatusLight = STOPPED_PROVIDER_SESSION_STATUS_LIGHT,
): ProviderSessionStatusLight {
  return coreProviderSessionStatusLightForTargetKeys(
    providerSessionStatusLightsByTarget,
    targetKeys,
    fallback,
  )
}

export function providerSessionStatusLightFromConversationState(
  record: AgentConversationRegistryRecord | undefined,
  runtimeState: AgentConversationRuntimeState | undefined,
): { light: ProviderSessionStatusLight; terminal: boolean } | undefined {
  const status = String(
    runtimeState?.run?.status
      ?? runtimeState?.status
      ?? record?.status
      ?? '',
  ).trim()
  if (!status) return undefined
  if (status === 'failed' || status === 'error') {
    return {
      terminal: true,
      light: {
        state: 'error',
        label: '错误',
        detail: 'Runtime 会话已失败。',
      },
    }
  }
  if (status === 'completed' || status === 'completed_with_warnings' || status === 'cancelled' || status === 'idle') {
    return { terminal: true, light: STOPPED_PROVIDER_SESSION_STATUS_LIGHT }
  }
  if (status === 'requires_action' || status === 'waiting') {
    return {
      terminal: false,
      light: {
        state: 'waiting',
        label: '等待',
        detail: 'Runtime 会话正在等待用户或外部输入。',
      },
    }
  }
  if (status === 'queued') {
    return { terminal: true, light: STOPPED_PROVIDER_SESSION_STATUS_LIGHT }
  }
  if (status === 'running' || status === 'in_progress') {
    return {
      terminal: false,
      light: {
        state: 'active',
        label: '运行',
        detail: 'Runtime 会话正在触发 run 循环。',
      },
    }
  }
  return undefined
}

export interface AgentConversationTabProviderSessionTarget extends ProviderSessionStatusLightWatchTarget {
  conversationId: string
  sessionId?: string
  threadId: string
}

export function buildAgentConversationTabProviderSessionTargets(input: {
  conversations: Conversation[]
  conversationThreadBindings?: Record<string, AgentConversationThreadBinding>
  conversationsById?: Record<string, AgentConversationRegistryRecord>
}): AgentConversationTabProviderSessionTarget[] {
  return input.conversations.flatMap((conversation) => {
    if (conversationProviderProtocol(conversation, input.conversationsById) === 'app-server') return []
    const binding = input.conversationThreadBindings?.[conversation.id]
    const sessionId = (binding?.providerSessionTreeId ?? conversation.providerSessionId ?? '').trim()
    const threadId = (binding?.providerThreadId ?? conversation.providerThreadId ?? '').trim()
    return [{
      conversationId: conversation.id,
      ...(sessionId ? { sessionId } : {}),
      threadId,
    }]
  })
}

function conversationProviderProtocol(
  conversation: Conversation,
  conversationsById: Record<string, AgentConversationRegistryRecord> | undefined,
): string | undefined {
  const recordProtocol = conversationsById?.[conversation.id]?.providerProtocol?.trim()
  if (recordProtocol) return recordProtocol
  const conversationProtocol = (conversation as Conversation & { providerProtocol?: unknown }).providerProtocol
  return typeof conversationProtocol === 'string' ? conversationProtocol.trim() || undefined : undefined
}
