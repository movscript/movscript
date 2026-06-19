import type { MouseEvent, PointerEvent, ReactNode } from 'react'
import { Archive, ChevronDown, ChevronRight, Folder, History, MessageSquare, Plus, Trash2 } from 'lucide-react'
import {
  AgentModeCompactNavItem, AgentModeConversationArchiveButton, AgentModeConversationItem, AgentModeConversationRow, AgentModeEmptyText, AgentModeGroup, AgentModeGroupBody, AgentModeGroupList, AgentModeGroupToggle, AgentModeIconSlot, AgentModeLabel, AgentModeMeta, AgentModeProjectGroup, AgentModeProjectGroupToggle, } from '@/features/agent/components/AgentModeUi'

import { formatAgentDate, formatAgentRelativeTime } from '@/features/agent/presentation/agentConversationLabels'
import type { Conversation } from '@/features/agent/state/agentStore'
import type { AgentThreadSummary } from '@movscript/core/agent/protocol'
import type { ProviderSessionStatusLight } from '@movscript/core/agent'

export type AgentModeProjectConversationGroup = {
  projectId: number
  projectName: string
  conversations: Conversation[]
}

export type AgentModeProviderIdentity = {
  provider: string
  providerId: string
  providerInstanceId: string
  providerProtocol: string
}

export type AgentModeHistoryItem =
  | {
      type: 'conversation'
      id: string
      timestamp: number
      conversation: Conversation
    }
  | {
      type: 'provider-thread'
      id: string
      timestamp: number
      providerIdentity: AgentModeProviderIdentity
      thread: AgentThreadSummary
    }

export function AgentSidebarGroup({
  title,
  icon,
  trailing,
  open,
  onOpenChange,
  children,
}: {
  title: string
  icon: ReactNode
  trailing?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  return (
    <AgentModeGroup>
      <AgentModeGroupToggle
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
      >
        {icon}
        <AgentModeLabel>{title}</AgentModeLabel>
        {trailing ? <AgentModeMeta>{trailing}</AgentModeMeta> : null}
        {open ? <AgentModeIconSlot><ChevronDown size={12} /></AgentModeIconSlot> : <AgentModeIconSlot><ChevronRight size={12} /></AgentModeIconSlot>}
      </AgentModeGroupToggle>
      {open ? <AgentModeGroupBody>{children}</AgentModeGroupBody> : null}
    </AgentModeGroup>
  )
}

export function AgentSidebarConversation({
  conversation,
  active,
  locale,
  title,
  archived,
  now,
  providerSessionStatusLight,
  onClick,
  onArchive,
  onDelete,
  archiveLabel,
  deleteLabel,
}: {
  conversation: Conversation
  active: boolean
  locale: string
  title: string
  archived: boolean
  now: number
  providerSessionStatusLight?: ProviderSessionStatusLight
  onClick: () => void
  onArchive?: () => void
  onDelete?: () => void
  archiveLabel: string
  deleteLabel?: string
}) {
  const relativeTime = formatAgentRelativeTime(conversation.updatedAt, locale, now)
  const showArchiveAction = Boolean(onArchive && !archived)
  const showDeleteAction = Boolean(archived && onDelete)
  const stopRowActionPropagation = (event: MouseEvent<HTMLButtonElement> | PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
  }

  return (
    <AgentModeConversationRow>
      <AgentModeConversationItem
        onClick={onClick}
        active={active}
        icon={providerSessionStatusLight ? (
          <span className="agent-mode-conversation__icon-stack">
            <span
              className="agent-mode-conversation-session-light"
              data-session-state={providerSessionStatusLight.state}
              aria-hidden="true"
              title={providerSessionStatusLight.detail}
            />
          </span>
        ) : undefined}
        title={title}
        meta={relativeTime}
        hasAction={showArchiveAction || showDeleteAction}
      />
      {showArchiveAction ? (
        <AgentModeConversationArchiveButton
          type="button"
          onPointerDown={stopRowActionPropagation}
          onClick={(event) => {
            event.stopPropagation()
            onArchive?.()
          }}
          aria-label={archiveLabel}
          title={archiveLabel}
        >
          <Archive size={12} />
        </AgentModeConversationArchiveButton>
      ) : null}
      {showDeleteAction ? (
        <AgentModeConversationArchiveButton
          type="button"
          onPointerDown={stopRowActionPropagation}
          onClick={(event) => {
            event.stopPropagation()
            onDelete?.()
          }}
          aria-label={deleteLabel}
          title={deleteLabel}
        >
          <Trash2 size={12} />
        </AgentModeConversationArchiveButton>
      ) : null}
    </AgentModeConversationRow>
  )
}

export function ProjectAgentModeProjectGroupsSection({
  groups,
  openProjectGroups,
  expandedProjectThreadGroups,
  activeConversationId,
  locale,
  now,
  providerSessionStatusLights,
  labels,
  onToggleProjectGroup,
  onToggleProjectThreadGroup,
  onSelectConversation,
  onArchiveConversation,
  getConversationTitle,
}: {
  groups: AgentModeProjectConversationGroup[]
  openProjectGroups: Record<number, boolean>
  expandedProjectThreadGroups: Record<number, boolean>
  activeConversationId: string | null
  locale: string
  now: number
  providerSessionStatusLights: Record<string, ProviderSessionStatusLight | undefined>
  labels: {
    noProjectConversations: string
    archiveConversation: string
    collapseProjectConversations: string
    expandProjectConversations: string
  }
  onToggleProjectGroup: (projectId: number) => void
  onToggleProjectThreadGroup: (projectId: number) => void
  onSelectConversation: (conversationId: string) => void
  onArchiveConversation: (conversation: Conversation) => void
  getConversationTitle: (conversation: Conversation) => string
}) {
  if (groups.length === 0) {
    return <AgentModeEmptyText>{labels.noProjectConversations}</AgentModeEmptyText>
  }

  return (
    <AgentModeGroupList>
      {groups.map((group) => {
        const open = openProjectGroups[group.projectId] ?? false
        const expanded = expandedProjectThreadGroups[group.projectId] ?? false
        const visibleConversations = expanded ? group.conversations : group.conversations.slice(0, 5)
        const hasHiddenConversations = group.conversations.length > visibleConversations.length

        return (
          <AgentModeProjectGroup key={group.projectId}>
            <AgentModeProjectGroupToggle
              onClick={() => onToggleProjectGroup(group.projectId)}
              aria-expanded={open}
            >
              {open
                ? <AgentModeIconSlot><ChevronDown size={12} /></AgentModeIconSlot>
                : <AgentModeIconSlot><ChevronRight size={12} /></AgentModeIconSlot>}
              <AgentModeIconSlot><Folder size={14} /></AgentModeIconSlot>
              <AgentModeLabel>{group.projectName}</AgentModeLabel>
              <AgentModeMeta>{group.conversations.length}</AgentModeMeta>
            </AgentModeProjectGroupToggle>
            {open ? (
              <AgentModeGroupList nested>
                {visibleConversations.length > 0 ? visibleConversations.map((conversation) => (
                  <AgentSidebarConversation
                    key={conversation.id}
                    conversation={conversation}
                    active={conversation.id === activeConversationId}
                    locale={locale}
                    title={getConversationTitle(conversation)}
                    archived={conversation.archived === true}
                    now={now}
                    providerSessionStatusLight={providerSessionStatusLights[conversation.id]}
                    onClick={() => onSelectConversation(conversation.id)}
                    onArchive={() => onArchiveConversation(conversation)}
                    archiveLabel={labels.archiveConversation}
                  />
                )) : (
                  <AgentModeEmptyText>{labels.noProjectConversations}</AgentModeEmptyText>
                )}
                {hasHiddenConversations || expanded ? (
                  <AgentModeCompactNavItem onClick={() => onToggleProjectThreadGroup(group.projectId)}>
                    {expanded ? labels.collapseProjectConversations : labels.expandProjectConversations}
                  </AgentModeCompactNavItem>
                ) : null}
              </AgentModeGroupList>
            ) : null}
          </AgentModeProjectGroup>
        )
      })}
    </AgentModeGroupList>
  )
}

export function ProjectAgentModeChatConversationsSection({
  open,
  conversations,
  visibleConversations,
  hiddenConversationCount,
  showAllConversations,
  activeConversationId,
  locale,
  now,
  providerSessionStatusLights,
  labels,
  onOpenChange,
  onStartConversation,
  onToggleShowAll,
  onSelectConversation,
  onArchiveConversation,
  getConversationTitle,
}: {
  open: boolean
  conversations: Conversation[]
  visibleConversations: Conversation[]
  hiddenConversationCount: number
  showAllConversations: boolean
  activeConversationId: string | null
  locale: string
  now: number
  providerSessionStatusLights: Record<string, ProviderSessionStatusLight | undefined>
  labels: {
    conversations: string
    startConversation: string
    archiveConversation: string
    showFewerConversations: string
    showMoreConversations: (count: number) => string
  }
  onOpenChange: (open: boolean) => void
  onStartConversation: () => void
  onToggleShowAll: () => void
  onSelectConversation: (conversationId: string) => void
  onArchiveConversation: (conversation: Conversation) => void
  getConversationTitle: (conversation: Conversation) => string
}) {
  return (
    <AgentSidebarGroup
      title={labels.conversations}
      icon={<MessageSquare size={13} />}
      trailing={conversations.length > 0 ? `${conversations.length}` : undefined}
      open={open}
      onOpenChange={onOpenChange}
    >
      {conversations.length === 0 ? (
        <AgentModeCompactNavItem onClick={onStartConversation}>
          <AgentModeIconSlot><Plus size={12} /></AgentModeIconSlot>
          {labels.startConversation}
        </AgentModeCompactNavItem>
      ) : (
        <AgentModeGroupList nested>
          {visibleConversations.map((conversation) => (
            <AgentSidebarConversation
              key={conversation.id}
              conversation={conversation}
              active={conversation.id === activeConversationId}
              locale={locale}
              title={getConversationTitle(conversation)}
              archived={conversation.archived === true}
              now={now}
              providerSessionStatusLight={providerSessionStatusLights[conversation.id]}
              onClick={() => onSelectConversation(conversation.id)}
              onArchive={() => onArchiveConversation(conversation)}
              archiveLabel={labels.archiveConversation}
            />
          ))}
          {hiddenConversationCount > 0 || showAllConversations ? (
            <AgentModeCompactNavItem onClick={onToggleShowAll}>
              {showAllConversations ? labels.showFewerConversations : labels.showMoreConversations(hiddenConversationCount)}
            </AgentModeCompactNavItem>
          ) : null}
        </AgentModeGroupList>
      )}
    </AgentSidebarGroup>
  )
}

export function ProjectAgentModeHistorySection({
  open,
  items,
  visibleItems,
  hiddenItemCount,
  showAllItems,
  activeConversationId,
  locale,
  now,
  loading,
  labels,
  onOpenChange,
  onToggleShowAll,
  onSelectConversation,
  onDeleteConversation,
  onRestoreThread,
  onDeleteThread,
  getConversationTitle,
  getThreadTitle,
  getThreadDescription,
}: {
  open: boolean
  items: AgentModeHistoryItem[]
  visibleItems: AgentModeHistoryItem[]
  hiddenItemCount: number
  showAllItems: boolean
  activeConversationId: string | null
  locale: string
  now: number
  loading: boolean
  labels: {
    history: string
    loading: string
    noHistoryConversations: string
    archiveConversation: string
    deleteConversation: string
    showFewerConversations: string
    showMoreConversations: (count: number) => string
  }
  onOpenChange: (open: boolean) => void
  onToggleShowAll: () => void
  onSelectConversation: (conversationId: string) => void
  onDeleteConversation: (conversation: Conversation) => void
  onRestoreThread: (threadId: string, providerIdentity: AgentModeProviderIdentity) => void
  onDeleteThread: (threadId: string, providerIdentity: AgentModeProviderIdentity) => void
  getConversationTitle: (conversation: Conversation) => string
  getThreadTitle: (thread: AgentThreadSummary) => string
  getThreadDescription: (thread: AgentThreadSummary) => string
}) {
  return (
    <AgentSidebarGroup
      title={labels.history}
      icon={<History size={13} />}
      trailing={items.length > 0 ? `${items.length}` : undefined}
      open={open}
      onOpenChange={onOpenChange}
    >
      {items.length === 0 ? (
        <AgentModeEmptyText>
          {loading ? labels.loading : labels.noHistoryConversations}
        </AgentModeEmptyText>
      ) : (
        <AgentModeGroupList nested>
          {visibleItems.map((item) => {
            if (item.type === 'conversation') {
              return (
                <AgentSidebarConversation
                  key={item.id}
                  conversation={item.conversation}
                  active={item.conversation.id === activeConversationId}
                  locale={locale}
                  title={getConversationTitle(item.conversation)}
                  archived
                  now={now}
                  onClick={() => onSelectConversation(item.conversation.id)}
                  onDelete={() => onDeleteConversation(item.conversation)}
                  archiveLabel={labels.archiveConversation}
                  deleteLabel={labels.deleteConversation}
                />
              )
            }
            const thread = item.thread
            return (
              <AgentModeConversationRow key={thread.id}>
                <AgentModeConversationItem
                  icon={<History size={11} />}
                  title={getThreadTitle(thread)}
                  description={getThreadDescription(thread)}
                  meta={formatAgentDate(thread.updatedAt, locale)}
                  onClick={() => onRestoreThread(thread.id, item.providerIdentity)}
                  hasAction
                />
                <AgentModeConversationArchiveButton
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    onDeleteThread(thread.id, item.providerIdentity)
                  }}
                  aria-label={labels.deleteConversation}
                  title={labels.deleteConversation}
                >
                  <Trash2 size={12} />
                </AgentModeConversationArchiveButton>
              </AgentModeConversationRow>
            )
          })}
          {hiddenItemCount > 0 || showAllItems ? (
            <AgentModeCompactNavItem onClick={onToggleShowAll}>
              {showAllItems ? labels.showFewerConversations : labels.showMoreConversations(hiddenItemCount)}
            </AgentModeCompactNavItem>
          ) : null}
        </AgentModeGroupList>
      )}
    </AgentSidebarGroup>
  )
}
