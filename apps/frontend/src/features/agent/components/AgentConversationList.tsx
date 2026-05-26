import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { AgentConversationListItem } from '@movscript/ui'
import { AgentConversationListPanel } from '@movscript/ui'
import { conversationDisplayTitle, formatAgentDate, localThreadTitle } from '@/features/agent/presentation/agentConversationLabels'
import { localAgentClient, type AgentThreadSummary } from '@/shared/infrastructure/localAgentClient'
import type { Conversation } from '@/features/agent/state/agentStore'

export function ConversationList({
  conversations,
  archivedConversations = [],
  onSelect,
  onNew,
  onDelete,
  onCollapse,
  showCollapse = true,
  onRestoreLocalThread,
}: {
  conversations: Conversation[]
  archivedConversations?: Conversation[]
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onCollapse: () => void
  showCollapse?: boolean
  onRestoreLocalThread: (threadId: string) => Promise<void>
}) {
  const { t, i18n } = useTranslation()
  const [restoringThreadId, setRestoringThreadId] = useState<string | null>(null)
  const { data: localThreads = [], isFetching: fetchingLocalThreads, refetch: refetchLocalThreads } = useQuery<AgentThreadSummary[]>({
    queryKey: ['local-agent-threads', localAgentClient.baseURL],
    queryFn: async () => {
      await localAgentClient.ensureRunning()
      return localAgentClient.listThreads().then((r) => r.threads)
    },
    enabled: true,
    retry: false,
  })

  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'

  async function restoreThread(threadId: string) {
    setRestoringThreadId(threadId)
    try {
      await onRestoreLocalThread(threadId)
    } finally {
      setRestoringThreadId(null)
    }
  }

  const mappedConversations: AgentConversationListItem[] = useMemo(() => conversations.map((conv) => ({
    id: conv.id,
    title: conversationDisplayTitle(conv, t),
    description: conv.messages[conv.messages.length - 1]?.content.slice(0, 54) ?? '',
    meta: formatAgentDate(conv.updatedAt, locale),
    onClick: () => onSelect(conv.id),
    onDelete: () => onDelete(conv.id),
  })), [conversations, locale, onDelete, onSelect, t])

  const archivedRuntimeThreadIds = useMemo(
    () => new Set(archivedConversations.flatMap((conversation) => conversation.runtimeThreadId ? [conversation.runtimeThreadId] : [])),
    [archivedConversations],
  )
  const mappedHistoryItems: AgentConversationListItem[] = useMemo(() => [
    ...archivedConversations.map((conv) => ({
      id: conv.id,
      title: conversationDisplayTitle(conv, t),
      description: conv.messages[conv.messages.length - 1]?.content.slice(0, 54) || t('agents.chat.archivedConversation'),
      meta: formatAgentDate(conv.updatedAt, locale),
      onClick: () => onSelect(conv.id),
    })),
    ...localThreads.filter((thread) => !archivedRuntimeThreadIds.has(thread.id)).map((thread) => ({
    id: thread.id,
    title: localThreadTitle(thread, t),
    description: [
      t('agents.chat.messagesCount', { count: thread.messageCount }),
      thread.projectId ? t('agents.chat.panel.drafts.projectBadge', { id: thread.projectId }) : null,
    ].filter(Boolean).join(' · '),
    meta: restoringThreadId === thread.id ? t('agents.chat.restoring') : formatAgentDate(thread.updatedAt, locale),
    onClick: () => { void restoreThread(thread.id) },
    })),
  ], [archivedConversations, archivedRuntimeThreadIds, locale, localThreads, onSelect, restoringThreadId, t])

  return (
    <AgentConversationListPanel
      conversations={mappedConversations}
      localThreads={mappedHistoryItems}
      onNew={onNew}
      onCollapse={onCollapse}
      onRefreshLocalThreads={() => { void refetchLocalThreads() }}
      showCollapse={showCollapse}
      emptyLabel={t('agents.chat.noConversations')}
      localRuntimeLabel={t('agents.chat.conversationHistory')}
      localRuntimeThreadsEmptyLabel={t('agents.chat.noHistoryConversations')}
      newConversationLabel={t('agents.chat.newConversation')}
      collapseAssistantLabel={t('agents.chat.collapseAssistant')}
      archiveConversationLabel={t('agents.chat.archiveConversation')}
      refreshLabel={t('agents.chat.localRuntime')}
    />
  )
}
