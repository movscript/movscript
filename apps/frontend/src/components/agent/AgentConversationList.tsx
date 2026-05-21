import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { History, PanelRightClose, Plus, RefreshCw, X } from 'lucide-react'
import {
  AgentBody,
  AgentConversationItem,
  AgentEmpty,
  AgentHeader,
  AgentHeaderActions,
  AgentMain,
  AgentSidebarSection,
  AgentSidebarTitle,
  Button,
  ScrollArea,
} from '@movscript/ui'
import { localAgentClient, type AgentThreadSummary } from '@/lib/localAgentClient'
import type { Conversation } from '@/store/agentStore'

export function conversationDisplayTitle(conv: Conversation, t: ReturnType<typeof useTranslation>['t']) {
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

export function localThreadTitle(thread: Pick<AgentThreadSummary, 'title' | 'id'>, t: ReturnType<typeof useTranslation>['t']) {
  return thread.title || t('agents.chat.panel.runtime.localThreadTitle', { id: thread.id.slice(-6) })
}

export function ConversationList({
  conversations,
  onSelect,
  onNew,
  onDelete,
  onCollapse,
  showCollapse = true,
  onRestoreLocalThread,
}: {
  conversations: Conversation[]
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onCollapse: () => void
  showCollapse?: boolean
  onRestoreLocalThread: (threadId: string) => Promise<void>
}) {
  const { t, i18n } = useTranslation()
  const localRuntimeEnabled = true
  const [restoringThreadId, setRestoringThreadId] = useState<string | null>(null)
  const { data: localThreads = [], isFetching: fetchingLocalThreads, refetch: refetchLocalThreads } = useQuery<AgentThreadSummary[]>({
    queryKey: ['local-agent-threads', localAgentClient.baseURL],
    queryFn: async () => {
      await localAgentClient.ensureRunning()
      return localAgentClient.listThreads().then((r) => r.threads)
    },
    enabled: localRuntimeEnabled,
    retry: false,
  })

  function formatDate(ts: number) {
    const locale = i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US'
    return formatAgentDate(ts, locale)
  }

  async function restoreThread(threadId: string) {
    setRestoringThreadId(threadId)
    try {
      await onRestoreLocalThread(threadId)
    } finally {
      setRestoringThreadId(null)
    }
  }

  return (
    <AgentMain>
      <AgentHeader className="ai-agent-panel-list-header">
        <AgentHeaderActions className="ai-agent-panel-list-header-actions">
          <Button size="icon-sm" variant="ghost" onClick={onNew} aria-label={t('agents.chat.newConversation')} title={t('agents.chat.newConversation')} className="shrink-0">
            <Plus size={14} />
          </Button>
          {showCollapse && (
            <Button size="icon-sm" variant="ghost" onClick={onCollapse} aria-label={t('agents.chat.collapseAssistant')} title={t('agents.chat.collapseAssistant')} className="ai-agent-panel-header-collapse">
              <PanelRightClose size={15} />
            </Button>
          )}
        </AgentHeaderActions>
      </AgentHeader>
      <AgentBody>
        <ScrollArea className="h-full">
        {conversations.length === 0 ? (
          <AgentEmpty className="min-h-0 py-12">
            <p className="type-body font-medium text-foreground">{t('agents.chat.noConversations')}</p>
          </AgentEmpty>
        ) : (
          <AgentSidebarSection>
            {conversations.map((conv) => (
              <div key={conv.id} className="group relative">
                <AgentConversationItem
                  onClick={() => onSelect(conv.id)}
                  title={conversationDisplayTitle(conv, t)}
                  description={conv.messages[conv.messages.length - 1]?.content.slice(0, 54) ?? ''}
                  meta={formatDate(conv.updatedAt)}
                  className="pr-10"
                />
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={(e) => { e.stopPropagation(); onDelete(conv.id) }}
                  className="absolute bottom-2 right-2 text-muted-foreground/50 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  aria-label={t('agents.chat.deleteConversation')}
                >
                  <X size={11} />
                </Button>
              </div>
            ))}
          </AgentSidebarSection>
        )}
        <AgentSidebarSection>
          <div className="mb-1 flex items-center justify-between px-1">
            <AgentSidebarTitle className="px-0">
              <span className="inline-flex items-center gap-1"><History size={11} /> {t('agents.chat.localRuntime')}</span>
            </AgentSidebarTitle>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => refetchLocalThreads()}
              className="px-1 type-tiny text-muted-foreground"
            >
              <RefreshCw size={10} className={fetchingLocalThreads ? 'animate-spin' : ''} />
            </Button>
          </div>
          {localThreads.length === 0 ? (
            <p className="px-1 type-tiny text-muted-foreground">{t('agents.chat.localRuntimeThreadsEmpty')}</p>
          ) : localThreads.map((thread) => (
            <AgentConversationItem
              key={thread.id}
              onClick={() => restoreThread(thread.id)}
              title={localThreadTitle(thread, t)}
              description={[
                t('agents.chat.messagesCount', { count: thread.messageCount }),
                thread.projectId ? t('agents.chat.panel.drafts.projectBadge', { id: thread.projectId }) : null,
              ].filter(Boolean).join(' · ')}
              meta={restoringThreadId === thread.id ? t('agents.chat.restoring') : formatAgentDate(thread.updatedAt, i18n.resolvedLanguage?.startsWith('zh') ? 'zh-CN' : 'en-US')}
            />
          ))}
        </AgentSidebarSection>
        </ScrollArea>
      </AgentBody>
    </AgentMain>
  )
}
