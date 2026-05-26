import type { AgentThreadSummary } from '@/shared/infrastructure/localAgentClient'
import type { Conversation } from '@/features/agent/state/agentStore'

type TranslationFn = (key: string, options?: Record<string, unknown>) => string

export function conversationDisplayTitle(conv: Pick<Conversation, 'title'>, t: TranslationFn) {
  const title = conv.title.trim()
  if (!title) return t('agents.chat.newConversation')
  if (title === t('agents.chat.aiAssistant')) return t('agents.chat.newConversation')
  return title
}

export function formatAgentDate(value: string | number, locale: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}

export function localThreadTitle(thread: Pick<AgentThreadSummary, 'title' | 'id'>, t: TranslationFn) {
  return thread.title || t('agents.chat.panel.runtime.localThreadTitle', { id: thread.id.slice(-6) })
}
