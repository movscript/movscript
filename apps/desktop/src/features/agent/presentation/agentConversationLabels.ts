import type { AgentThreadSummary } from '@movscript/agent-protocol'
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

export function formatAgentRelativeTime(value: string | number, locale: string, now: number = Date.now()) {
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return ''
  const diffMs = timestamp - now
  const absMs = Math.abs(diffMs)
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (absMs < 60_000) return formatter.format(0, 'minute')
  if (absMs < 60 * 60_000) return formatter.format(Math.round(diffMs / 60_000), 'minute')
  if (absMs < 24 * 60 * 60_000) return formatter.format(Math.round(diffMs / (60 * 60_000)), 'hour')
  if (absMs < 30 * 24 * 60 * 60_000) return formatter.format(Math.round(diffMs / (24 * 60 * 60_000)), 'day')
  if (absMs < 12 * 30 * 24 * 60 * 60_000) return formatter.format(Math.round(diffMs / (30 * 24 * 60 * 60_000)), 'month')
  return formatter.format(Math.round(diffMs / (365 * 24 * 60 * 60_000)), 'year')
}

export function providerThreadTitle(thread: Pick<AgentThreadSummary, 'title'>, t: TranslationFn) {
  return thread.title || t('agents.chat.panel.providerSession.providerThreadTitle')
}
