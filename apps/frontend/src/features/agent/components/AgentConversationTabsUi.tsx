import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'

import { Button } from '@movscript/ui/primitives'
import { XIcon } from '@movscript/ui/primitives'

import {
  agentConversationTabClientPointFromEvent,
  resolveAgentConversationTabDragOver,
  resolveAgentConversationTabDrop,
  startAgentConversationTabDrag,
  type AgentConversationTabDropPosition,
} from '@/features/agent/components/conversation-tabs-ui/dragPayload'

export interface AgentConversationTabItem {
  id: string
  title: string
  messageCount?: number
  sessionState?: 'stopped' | 'waiting' | 'active' | 'error'
  sessionDetail?: string
  onRename?: (title: string) => void | Promise<void>
}

export interface AgentConversationTabsPanelProps {
  activeConversationId: string
  conversations: AgentConversationTabItem[]
  endAccessory?: ReactNode
  onCloseConversation: (id: string) => void
  onCloseTabContextMenu: () => void
  onOpenKeyboardMenu: (event: KeyboardEvent, conversationId: string) => void
  onOpenMenu: (event: MouseEvent, conversationId: string) => void
  onReorderConversation: (draggedId: string, targetId: string, position: 'before' | 'after') => void
  onSelectConversation: (id: string) => void
  conversationTabsLabel: string
  archiveConversationLabel: string
  closeConversationLabel: string
  renameConversationLabel: string
}

type DropTarget = { conversationId: string; position: AgentConversationTabDropPosition }

export function AgentConversationTabsPanel({
  activeConversationId,
  conversations,
  endAccessory,
  onCloseConversation,
  onCloseTabContextMenu,
  onOpenKeyboardMenu,
  onOpenMenu,
  onReorderConversation,
  onSelectConversation,
  conversationTabsLabel,
  closeConversationLabel,
  renameConversationLabel,
}: AgentConversationTabsPanelProps) {
  const [draggingConversationId, setDraggingConversationId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null)

  function clearDragState() {
    setDraggingConversationId(null)
    setDropTarget(null)
  }

  return (
    <div
      className="ai-agent-panel-conversation-tabs"
      role="tablist"
      aria-label={conversationTabsLabel}
      data-density={conversations.length > 4 ? 'scroll' : 'fit'}
    >
      <div className="ai-agent-panel-conversation-tabs__items">
        {conversations.map((item) => (
          <AgentConversationTab
            key={item.id}
            item={item}
            isActive={item.id === activeConversationId}
            isDragging={draggingConversationId === item.id}
            isEditing={editingConversationId === item.id}
            dropPosition={dropTarget?.conversationId === item.id ? dropTarget.position : undefined}
            tabLabel={item.sessionState ? `${item.title}, Session ${item.sessionState}` : item.title}
            conversationTabsLabel={conversationTabsLabel}
            closeConversationLabel={closeConversationLabel}
            renameConversationLabel={renameConversationLabel}
            onCloseConversation={onCloseConversation}
            onCloseTabContextMenu={onCloseTabContextMenu}
            onEditingChange={(editing) => setEditingConversationId(editing ? item.id : null)}
            onOpenKeyboardMenu={onOpenKeyboardMenu}
            onOpenMenu={onOpenMenu}
            onSelectConversation={onSelectConversation}
            onDragStart={(event) => {
              if ((event.target as HTMLElement).closest('.ai-agent-panel-conversation-tab-close')) {
                event.preventDefault()
                return
              }
              onCloseTabContextMenu()
              startAgentConversationTabDrag(event.dataTransfer, item.id)
              setDraggingConversationId(item.id)
            }}
            onDragOver={(event) => {
              const target = resolveAgentConversationTabDragOver({
                dataTransfer: event.dataTransfer,
                draggingConversationId,
                targetConversationId: item.id,
                point: agentConversationTabClientPointFromEvent(event),
                tabElement: event.currentTarget,
              })
              if (!target) {
                setDropTarget(null)
                return
              }
              event.preventDefault()
              setDropTarget(target)
            }}
            onDragLeave={(event) => {
              const nextTarget = event.relatedTarget
              if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return
              if (dropTarget?.conversationId === item.id) setDropTarget(null)
            }}
            onDrop={(event) => {
              const drop = resolveAgentConversationTabDrop({
                dataTransfer: event.dataTransfer,
                draggingConversationId,
                targetConversationId: item.id,
                point: agentConversationTabClientPointFromEvent(event),
                tabElement: event.currentTarget,
              })
              event.preventDefault()
              clearDragState()
              if (!drop) return
              onReorderConversation(drop.draggedConversationId, drop.targetConversationId, drop.position)
            }}
            onDragEnd={clearDragState}
          />
        ))}
      </div>
      {endAccessory ? (
        <div className="ai-agent-panel-conversation-tabs__end">
          {endAccessory}
        </div>
      ) : null}
    </div>
  )
}

interface AgentConversationTabProps {
  item: AgentConversationTabItem
  isActive: boolean
  isDragging: boolean
  isEditing: boolean
  dropPosition?: 'before' | 'after'
  tabLabel: string
  conversationTabsLabel: string
  closeConversationLabel: string
  renameConversationLabel: string
  onCloseConversation: (id: string) => void
  onCloseTabContextMenu: () => void
  onEditingChange: (editing: boolean) => void
  onOpenKeyboardMenu: (event: KeyboardEvent, conversationId: string) => void
  onOpenMenu: (event: MouseEvent, conversationId: string) => void
  onSelectConversation: (id: string) => void
  onDragStart: (event: DragEvent<HTMLDivElement>) => void
  onDragOver: (event: DragEvent<HTMLDivElement>) => void
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void
  onDrop: (event: DragEvent<HTMLDivElement>) => void
  onDragEnd: () => void
}

function AgentConversationTab({
  item,
  isActive,
  isDragging,
  isEditing,
  dropPosition,
  tabLabel,
  conversationTabsLabel,
  closeConversationLabel,
  renameConversationLabel,
  onCloseConversation,
  onCloseTabContextMenu,
  onEditingChange,
  onOpenKeyboardMenu,
  onOpenMenu,
  onSelectConversation,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: AgentConversationTabProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [draftTitle, setDraftTitle] = useState(item.title)

  useEffect(() => {
    if (!isEditing) return
    setDraftTitle(item.title)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [isEditing, item.title])

  function startEditing(event: MouseEvent) {
    if (!item.onRename) return
    event.preventDefault()
    event.stopPropagation()
    onCloseTabContextMenu()
    onEditingChange(true)
  }

  function cancelEditing() {
    setDraftTitle(item.title)
    onEditingChange(false)
  }

  function commitEditing() {
    const trimmed = draftTitle.trim()
    if (!trimmed || trimmed === item.title.trim()) {
      cancelEditing()
      return
    }
    onEditingChange(false)
    void item.onRename?.(trimmed)
  }

  return (
    <div
      className="ai-agent-panel-conversation-tab"
      data-active={isActive ? 'true' : 'false'}
      data-dragging={isDragging ? 'true' : undefined}
      data-editing={isEditing ? 'true' : undefined}
      data-drop-position={dropPosition}
      draggable={!isEditing}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onContextMenu={(event) => onOpenMenu(event, item.id)}
    >
      {isEditing ? (
        <form
          className="ai-agent-panel-conversation-tab-main ai-agent-panel-conversation-tab-edit"
          onSubmit={(event) => {
            event.preventDefault()
            commitEditing()
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.stopPropagation()}
        >
          <input
            ref={inputRef}
            className="ai-agent-panel-conversation-tab-input"
            aria-label={renameConversationLabel}
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onBlur={commitEditing}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                cancelEditing()
              }
            }}
          />
        </form>
      ) : (
        <Button
          type="button"
          variant="ghost"
          fullWidth
          align="start"
          role="tab"
          aria-selected={isActive}
          aria-label={tabLabel}
          className="ai-agent-panel-conversation-tab-main"
          title={`${item.title} - ${conversationTabsLabel}`}
          onDoubleClick={startEditing}
          onClick={() => {
            onCloseTabContextMenu()
            onSelectConversation(item.id)
          }}
          onKeyDown={(event) => onOpenKeyboardMenu(event, item.id)}
          onAuxClick={(event) => {
            if (event.button !== 1) return
            event.preventDefault()
            onCloseConversation(item.id)
          }}
        >
          {item.sessionState ? (
            <span
              className="ai-agent-panel-conversation-tab-session-light"
              data-session-state={item.sessionState}
              aria-hidden="true"
              title={item.sessionDetail}
            />
          ) : null}
          <span className="ai-agent-panel-conversation-tab-title">{item.title}</span>
          {typeof item.messageCount === 'number' ? (
            <span className="ai-agent-panel-conversation-tab-count" aria-label={String(item.messageCount)}>
              {item.messageCount}
            </span>
          ) : null}
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="ai-agent-panel-conversation-tab-close"
        draggable={false}
        aria-label={closeConversationLabel}
        title={closeConversationLabel}
        onPointerDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onMouseDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onCloseConversation(item.id)
        }}
      >
        <XIcon />
      </Button>
    </div>
  )
}
