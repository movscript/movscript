import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { AgentConversationListItem } from '@movscript/ui'
import { AgentConversationListPanel } from '@movscript/ui'
import { conversationDisplayTitle, formatAgentDate } from '@/features/agent/presentation/agentConversationLabels'
import { latestTranscriptChatMessage, transcriptMessageCount } from '@/features/agent/domain/agentMessageBoundaries'
import { listProviderSessionSummariesFromWorkspace } from '@/features/agent/application/providerSessionThreadQueryCache'
import { providerSessionConversationTitle } from '@/features/agent/presentation/providerSessionThreadConversation'
import { providerSessionClient, type AgentSessionSummary } from '@/shared/infrastructure/providerSessionClient'
import type { Conversation } from '@/features/agent/state/agentStore'

export function ConversationList({
  conversations,
  archivedConversations = [],
  onSelect,
  onNew,
  onArchive,
  onDelete,
  onRename,
  onCollapse,
  showCollapse = true,
  onRestoreProviderThread,
}: {
  conversations: Conversation[]
  archivedConversations?: Conversation[]
  onSelect: (id: string) => void
  onNew: () => void
  onArchive: (id: string) => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
  onCollapse: () => void
  showCollapse?: boolean
  onRestoreProviderThread: (threadId: string, sessionId?: string) => Promise<void>
}) {
  const { t, i18n } = useTranslation()
  const [restoringThreadId, setRestoringThreadId] = useState<string | null>(null)
  const { data: providerSessions = [], refetch: refetchProviderSessions } = useQuery<AgentSessionSummary[]>({
    queryKey: ['provider-sessions', providerSessionClient.baseURL],
    queryFn: () => listProviderSessionSummariesFromWorkspace(),
    enabled: true,
    retry: false,
  })

  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'

  async function restoreThread(threadId: string, sessionId?: string) {
    setRestoringThreadId(threadId)
    try {
      await onRestoreProviderThread(threadId, sessionId)
    } finally {
      setRestoringThreadId(null)
    }
  }

  const conversationDescription = useCallback((conv: Conversation, fallback = '') => {
    const lastMessage = latestTranscriptChatMessage(conv)?.content.trim().slice(0, 54)
    if (lastMessage) return lastMessage
    const count = transcriptMessageCount(conv)
    return count > 0 ? t('agents.chat.messagesCount', { count }) : fallback
  }, [t])

  const mappedConversations: AgentConversationListItem[] = useMemo(() => conversations.map((conv) => ({
    id: conv.id,
    title: conversationDisplayTitle(conv, t),
    description: conversationDescription(conv),
    meta: formatAgentDate(conv.updatedAt, locale),
    onClick: () => onSelect(conv.id),
    onRename: (title: string) => onRename(conv.id, title),
    onArchive: () => onArchive(conv.id),
  })), [conversationDescription, conversations, locale, onArchive, onRename, onSelect, t])

  const archivedProviderSessionIds = useMemo(
    () => new Set(archivedConversations.flatMap((conversation) => conversation.providerSessionId ? [conversation.providerSessionId] : [])),
    [archivedConversations],
  )
  const openProviderSessionIds = useMemo(
    () => new Set(conversations.flatMap((conversation) => {
      const ids = conversation.providerSessionId ? [conversation.providerSessionId] : []
      if (conversation.id.startsWith('session_')) ids.push(conversation.id)
      return ids
    })),
    [conversations],
  )
  const mappedHistoryItems: AgentConversationListItem[] = useMemo(() => [
    ...archivedConversations.map((conv) => ({
      id: conv.id,
      title: conversationDisplayTitle(conv, t),
      description: conversationDescription(conv, t('agents.chat.archivedConversation')),
      meta: formatAgentDate(conv.updatedAt, locale),
      onClick: () => onSelect(conv.id),
      onRename: (title: string) => onRename(conv.id, title),
      onDelete: () => onDelete(conv.id),
    })),
    ...providerSessions
      .filter((session) => !archivedProviderSessionIds.has(session.id) && !openProviderSessionIds.has(session.id))
      .flatMap((session) => {
        const threadId = session.interactiveThreadId ?? session.rootThreadId ?? session.activeThreadId
        if (!threadId) return []
        return [{
          id: session.id,
          title: providerSessionConversationTitle(session, t),
          description: session.projectId ? t('agents.chat.panel.workspaces.projectBadge', { id: session.projectId }) : '',
          meta: restoringThreadId === threadId ? t('agents.chat.restoring') : formatAgentDate(session.updatedAt, locale),
          onClick: () => { void restoreThread(threadId, session.id) },
          onDelete: () => onDelete(threadId),
        }]
    }),
  ], [archivedConversations, archivedProviderSessionIds, conversationDescription, locale, providerSessions, onDelete, onRename, onSelect, openProviderSessionIds, restoringThreadId, t])

  return (
    <AgentConversationListPanel
      conversations={mappedConversations}
      providerSessionThreads={mappedHistoryItems}
      onNew={onNew}
      onCollapse={onCollapse}
      onRefreshProviderSessionThreads={() => { void refetchProviderSessions() }}
      showCollapse={showCollapse}
      emptyLabel={t('agents.chat.noConversations')}
      providerSessionThreadsLabel={t('agents.chat.conversationHistory')}
      providerSessionThreadsEmptyLabel={t('agents.chat.noHistoryConversations')}
      newConversationLabel={t('agents.chat.newConversation')}
      collapseAssistantLabel={t('agents.chat.collapseAssistant')}
      archiveConversationLabel={t('agents.chat.archiveConversation')}
      deleteConversationLabel={t('agents.chat.deleteConversation')}
      renameConversationLabel={t('agents.chat.renameConversation')}
      refreshLabel={t('agents.chat.providerSession')}
    />
  )
}
