import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { buildAgentMessageFacts } from '@/features/agent/domain/agentMessageFacts'
import { agentMessageBubbleModel } from '@/features/agent/presentation/agentMessageBubbleModel'
import type { AgentRun } from '@movscript/core/agent/protocol'
import type { ChatMessage, ChatRunActivity, ChatRunActivityEvent } from '@/features/agent/state/agentStore'
import type { AgentMessageFacts } from '@/features/agent/domain/agentMessageFacts'

export interface UseAgentMessageBubbleModelInput {
  message: ChatMessage
  timelineActivity?: ChatRunActivity
  liveInteractionRun?: AgentRun | null
  liveInteractionEvents?: ChatRunActivityEvent[]
  hiddenActivityActionItemIds?: Set<string>
}

export function useAgentMessageFactsModel(message: ChatMessage, timelineActivity?: ChatRunActivity) {
  return useMemo(() => cachedAgentMessageFacts(message, timelineActivity), [message, timelineActivity])
}

const messageFactsCache = new WeakMap<ChatMessage, {
  noActivity?: AgentMessageFacts
  byActivity?: WeakMap<ChatRunActivity, AgentMessageFacts>
}>()

export function cachedAgentMessageFacts(message: ChatMessage, timelineActivity?: ChatRunActivity): AgentMessageFacts {
  let entry = messageFactsCache.get(message)
  if (!entry) {
    entry = {}
    messageFactsCache.set(message, entry)
  }
  if (!timelineActivity) {
    entry.noActivity ??= buildAgentMessageFacts(message)
    return entry.noActivity
  }
  entry.byActivity ??= new WeakMap<ChatRunActivity, AgentMessageFacts>()
  const cached = entry.byActivity.get(timelineActivity)
  if (cached) return cached
  const next = buildAgentMessageFacts(message, { timelineActivity })
  entry.byActivity.set(timelineActivity, next)
  return next
}

export function useAgentMessageBubbleModel({
  message,
  timelineActivity,
  liveInteractionRun,
  liveInteractionEvents,
  hiddenActivityActionItemIds,
}: UseAgentMessageBubbleModelInput) {
  const { i18n } = useTranslation()
  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
  const time = useMemo(() => new Date(message.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }), [locale, message.timestamp])
  const facts = useAgentMessageFactsModel(message, timelineActivity)
  return useMemo(() => agentMessageBubbleModel(facts, message, {
    time,
    liveInteractionRun,
    liveInteractionEvents,
    hiddenActivityActionItemIds,
  }), [hiddenActivityActionItemIds, liveInteractionEvents, liveInteractionRun, message, facts, time])
}
