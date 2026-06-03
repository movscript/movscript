import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { AgentConversationListItem } from '@movscript/ui'
import { AgentConversationListPanel } from '@movscript/ui'
import { conversationDisplayTitle, formatAgentDate } from '@/features/agent/presentation/agentConversationLabels'
import { latestTranscriptChatMessage, transcriptMessageCount } from '@/features/agent/domain/agentMessageBoundaries'
import { listRuntimeSessionSummariesFromWorkspace } from '@/features/agent/application/agentRuntimeThreadQueryCache'
import { runtimeSessionConversationTitle } from '@/features/agent/presentation/agentRuntimeThreadConversation'
import { localAgentClient, type AgentSessionSummary } from '@/shared/infrastructure/localAgentClient'
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
  onRestoreLocalThread,
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
  onRestoreLocalThread: (threadId: string, sessionId?: string) => Promise<void>
}) {
  const { t, i18n } = useTranslation()
  const [restoringThreadId, setRestoringThreadId] = useState<string | null>(null)
  const { data: localSessions = [], refetch: refetchLocalSessions } = useQuery<AgentSessionSummary[]>({
    queryKey: ['local-agent-sessions', localAgentClient.baseURL],
    queryFn: () => listRuntimeSessionSummariesFromWorkspace(),
    enabled: true,
    retry: false,
  })

  const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'

  async function restoreThread(threadId: string, sessionId?: string) {
    setRestoringThreadId(threadId)
    try {
      await onRestoreLocalThread(threadId, sessionId)
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

  const archivedRuntimeSessionIds = useMemo(
    () => new Set(archivedConversations.flatMap((conversation) => conversation.runtimeSessionId ? [conversation.runtimeSessionId] : [])),
    [archivedConversations],
  )
  const openRuntimeSessionIds = useMemo(
    () => new Set(conversations.flatMap((conversation) => {
      const ids = conversation.runtimeSessionId ? [conversation.runtimeSessionId] : []
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
    ...localSessions
      .filter((session) => !archivedRuntimeSessionIds.has(session.id) && !openRuntimeSessionIds.has(session.id))
      .flatMap((session) => {
        const threadId = session.interactiveThreadId ?? session.rootThreadId ?? session.activeThreadId
        if (!threadId) return []
        return [{
          id: session.id,
          title: runtimeSessionConversationTitle(session, t),
          description: session.projectId ? t('agents.chat.panel.workspaces.projectBadge', { id: session.projectId }) : '',
          meta: restoringThreadId === threadId ? t('agents.chat.restoring') : formatAgentDate(session.updatedAt, locale),
          onClick: () => { void restoreThread(threadId, session.id) },
          onDelete: () => onDelete(threadId),
        }]
    }),
  ], [archivedConversations, archivedRuntimeSessionIds, conversationDescription, locale, localSessions, onDelete, onRename, onSelect, openRuntimeSessionIds, restoringThreadId, t])

  return (
    <AgentConversationListPanel
      conversations={mappedConversations}
      localThreads={mappedHistoryItems}
      onNew={onNew}
      onCollapse={onCollapse}
      onRefreshLocalThreads={() => { void refetchLocalSessions() }}
      showCollapse={showCollapse}
      emptyLabel={t('agents.chat.noConversations')}
      localRuntimeLabel={t('agents.chat.conversationHistory')}
      localRuntimeThreadsEmptyLabel={t('agents.chat.noHistoryConversations')}
      newConversationLabel={t('agents.chat.newConversation')}
      collapseAssistantLabel={t('agents.chat.collapseAssistant')}
      archiveConversationLabel={t('agents.chat.archiveConversation')}
      deleteConversationLabel={t('agents.chat.deleteConversation')}
      renameConversationLabel={t('agents.chat.renameConversation')}
      refreshLabel={t('agents.chat.localRuntime')}
    />
  )
}
