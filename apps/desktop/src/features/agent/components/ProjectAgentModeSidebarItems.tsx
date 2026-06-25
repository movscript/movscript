import type { MouseEvent, PointerEvent, ReactNode } from 'react'
import { Archive, ChevronDown, ChevronRight, Trash2 } from 'lucide-react'
import {
  AgentModeConversationArchiveButton,
  AgentModeConversationItem,
  AgentModeConversationRow,
  AgentModeGroup,
  AgentModeGroupBody,
  AgentModeGroupToggle,
  AgentModeIconSlot,
  AgentModeLabel,
  AgentModeMeta,
} from '@/features/agent/components/AgentModeUi'
import { formatAgentRelativeTime } from '@/features/agent/presentation/agentConversationLabels'
import type { Conversation } from '@/features/agent/state/agentStore'
import type { ProviderSessionStatusLight } from '@movscript/core/agent'

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
