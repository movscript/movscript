import { useState, type CSSProperties, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { conversationDisplayTitle } from '@/components/agent/AgentConversationList'
import type { AgentRuntimeStatusLight } from '@/lib/agentRuntimeStatusLight'
import type { Conversation } from '@/store/agentStore'

export interface AgentConversationTabsProps {
  activeConversationId: string
  conversations: Conversation[]
  onCloseConversation: (id: string) => void
  onCloseTabContextMenu: () => void
  onOpenKeyboardMenu: (event: KeyboardEvent, conversationId: string) => void
  onOpenMenu: (event: MouseEvent, conversationId: string) => void
  onReorderConversation: (draggedId: string, targetId: string, position: 'before' | 'after') => void
  onSelectConversation: (id: string) => void
  runtimeStatusLights?: Partial<Record<string, AgentRuntimeStatusLight>>
}

export function AgentConversationTabs({
  activeConversationId,
  conversations,
  onCloseConversation,
  onCloseTabContextMenu,
  onOpenKeyboardMenu,
  onOpenMenu,
  onReorderConversation,
  onSelectConversation,
  runtimeStatusLights,
}: AgentConversationTabsProps) {
  const { t } = useTranslation()
  const [draggingConversationId, setDraggingConversationId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ conversationId: string; position: 'before' | 'after' } | null>(null)

  function dropPositionForEvent(event: DragEvent<HTMLElement>): 'before' | 'after' {
    const rect = event.currentTarget.getBoundingClientRect()
    return event.clientX >= rect.left + rect.width / 2 ? 'after' : 'before'
  }

  function clearDragState() {
    setDraggingConversationId(null)
    setDropTarget(null)
  }

  return (
    <div
      className="ai-agent-panel-conversation-tabs"
      role="tablist"
      aria-label={t('agents.chat.conversationTabs')}
      data-density={conversations.length > 4 ? 'scroll' : 'fit'}
      style={{ '--ai-agent-panel-tab-count': conversations.length } as CSSProperties}
    >
      {conversations.map((item) => {
        const title = conversationDisplayTitle(item, t)
        const runtimeStatusLight = runtimeStatusLights?.[item.id]
        const tabLabel = runtimeStatusLight ? `${title}，Runtime ${runtimeStatusLight.label}` : title
        return (
          <div
            key={item.id}
            className="ai-agent-panel-conversation-tab"
            data-active={item.id === activeConversationId ? 'true' : 'false'}
            data-dragging={draggingConversationId === item.id ? 'true' : undefined}
            data-drop-position={dropTarget?.conversationId === item.id ? dropTarget.position : undefined}
            draggable
            onDragStart={(event) => {
              if ((event.target as HTMLElement).closest('.ai-agent-panel-conversation-tab-close')) {
                event.preventDefault()
                return
              }
              onCloseTabContextMenu()
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData('text/plain', item.id)
              setDraggingConversationId(item.id)
            }}
            onDragOver={(event) => {
              const draggedId = draggingConversationId ?? event.dataTransfer.getData('text/plain')
              if (!draggedId || draggedId === item.id) {
                setDropTarget(null)
                return
              }
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              setDropTarget({ conversationId: item.id, position: dropPositionForEvent(event) })
            }}
            onDragLeave={(event) => {
              const nextTarget = event.relatedTarget
              if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return
              if (dropTarget?.conversationId === item.id) setDropTarget(null)
            }}
            onDrop={(event) => {
              const draggedId = draggingConversationId ?? event.dataTransfer.getData('text/plain')
              const position = dropPositionForEvent(event)
              event.preventDefault()
              clearDragState()
              if (!draggedId || draggedId === item.id) return
              onReorderConversation(draggedId, item.id, position)
            }}
            onDragEnd={clearDragState}
            onContextMenu={(event) => onOpenMenu(event, item.id)}
          >
            <button
              type="button"
              role="tab"
              aria-selected={item.id === activeConversationId}
              aria-label={tabLabel}
              className="ai-agent-panel-conversation-tab-main"
              title={`${title} · ${t('agents.chat.tabActions')}`}
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
              {runtimeStatusLight ? (
                <span
                  className="ai-agent-panel-conversation-tab-runtime-light"
                  data-runtime-state={runtimeStatusLight.state}
                  aria-hidden="true"
                  title={runtimeStatusLight.detail}
                />
              ) : null}
              <span className="ai-agent-panel-conversation-tab-title">{title}</span>
              {item.messages.length > 0 ? (
                <span className="ai-agent-panel-conversation-tab-count" aria-label={t('agents.chat.messagesCount', { count: item.messages.length })}>
                  {item.messages.length}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className="ai-agent-panel-conversation-tab-close"
              aria-label={t('agents.chat.closeConversation')}
              title={t('agents.chat.closeConversation')}
              onClick={(event) => {
                event.stopPropagation()
                onCloseConversation(item.id)
              }}
            >
              <X size={10} aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
