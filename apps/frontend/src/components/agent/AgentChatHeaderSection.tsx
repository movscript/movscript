import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { History, PanelRightClose, Plus } from 'lucide-react'
import { AgentHeader, Button } from '@movscript/ui'
import { AgentConversationTabs } from '@/components/agent/AgentConversationTabs'
import type { Conversation } from '@/store/agentStore'

type ConversationTabMenuState = {
  conversationId: string
  x: number
  y: number
} | null

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export interface AgentChatHeaderSectionProps {
  activeConversation: Conversation
  conversations: Conversation[]
  onBack: () => void
  onCloseConversation: (id: string) => void
  onCloseConversations: (ids: string[]) => void
  onCollapse: () => void
  showCollapse?: boolean
  showConversationControls?: boolean
  onNewConversation: () => void
  onSelectConversation: (id: string) => void
}

export function AgentChatHeaderSection({
  activeConversation,
  conversations,
  onBack,
  onCloseConversation,
  onCloseConversations,
  onCollapse,
  showCollapse = true,
  showConversationControls = true,
  onNewConversation,
  onSelectConversation,
}: AgentChatHeaderSectionProps) {
  const { t } = useTranslation()
  const conversationTabs = useMemo(() => {
    const ordered = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)
    if (ordered.some((item) => item.id === activeConversation.id)) return ordered
    return [activeConversation, ...ordered]
  }, [activeConversation, conversations])
  const [tabContextMenu, setTabContextMenu] = useState<ConversationTabMenuState>(null)
  const closeAllConversationTabs = useCallback(() => {
    onCloseConversations(conversationTabs.map((item) => item.id))
  }, [conversationTabs, onCloseConversations])
  const closeOtherConversationTabs = useCallback((id: string) => {
    onCloseConversations(conversationTabs.filter((item) => item.id !== id).map((item) => item.id))
  }, [conversationTabs, onCloseConversations])
  const closeRightConversationTabs = useCallback((id: string) => {
    const index = conversationTabs.findIndex((item) => item.id === id)
    if (index < 0) return
    onCloseConversations(conversationTabs.slice(index + 1).map((item) => item.id))
  }, [conversationTabs, onCloseConversations])
  const openConversationTabMenu = useCallback((event: MouseEvent, conversationId: string) => {
    event.preventDefault()
    event.stopPropagation()
    const menuWidth = 184
    const menuHeight = 158
    setTabContextMenu({
      conversationId,
      x: clampNumber(event.clientX, 8, Math.max(8, window.innerWidth - menuWidth - 8)),
      y: clampNumber(event.clientY, 8, Math.max(8, window.innerHeight - menuHeight - 8)),
    })
  }, [])
  const openConversationTabKeyboardMenu = useCallback((event: KeyboardEvent, conversationId: string) => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
    event.preventDefault()
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    setTabContextMenu({
      conversationId,
      x: clampNumber(rect.left + 16, 8, Math.max(8, window.innerWidth - 184 - 8)),
      y: clampNumber(rect.bottom + 4, 8, Math.max(8, window.innerHeight - 158 - 8)),
    })
  }, [])
  const closeTabContextMenu = useCallback(() => setTabContextMenu(null), [])

  useEffect(() => {
    if (!tabContextMenu) return
    if (conversationTabs.some((item) => item.id === tabContextMenu.conversationId)) return
    setTabContextMenu(null)
  }, [conversationTabs, tabContextMenu])

  useEffect(() => {
    if (!tabContextMenu) return
    const close = () => setTabContextMenu(null)
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [tabContextMenu])

  const tabContextMenuNode = tabContextMenu ? (() => {
    const menuConversation = conversationTabs.find((item) => item.id === tabContextMenu.conversationId)
    if (!menuConversation) return null
    const menuIndex = conversationTabs.findIndex((item) => item.id === menuConversation.id)
    const hasRightTabs = menuIndex >= 0 && menuIndex < conversationTabs.length - 1
    const closeMenuConversation = () => {
      closeTabContextMenu()
      onCloseConversation(menuConversation.id)
    }
    const closeOtherMenuConversations = () => {
      closeTabContextMenu()
      closeOtherConversationTabs(menuConversation.id)
    }
    const closeRightMenuConversations = () => {
      closeTabContextMenu()
      closeRightConversationTabs(menuConversation.id)
    }
    const closeAllMenuConversations = () => {
      closeTabContextMenu()
      closeAllConversationTabs()
    }
    return (
      <div
        role="menu"
        aria-label={t('agents.chat.tabActions')}
        className="ai-agent-panel-tab-context-menu ms-dropdown__content"
        style={{ left: tabContextMenu.x, top: tabContextMenu.y }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button type="button" role="menuitem" className="ms-dropdown__item" onClick={closeMenuConversation}>
          {t('agents.chat.closeConversation')}
        </button>
        <button
          type="button"
          role="menuitem"
          className="ms-dropdown__item"
          disabled={conversationTabs.length <= 1}
          data-disabled={conversationTabs.length <= 1 ? '' : undefined}
          onClick={closeOtherMenuConversations}
        >
          {t('agents.chat.closeOtherConversations')}
        </button>
        <button
          type="button"
          role="menuitem"
          className="ms-dropdown__item"
          disabled={!hasRightTabs}
          data-disabled={!hasRightTabs ? '' : undefined}
          onClick={closeRightMenuConversations}
        >
          {t('agents.chat.closeRightConversations')}
        </button>
        <div className="ms-dropdown__separator" />
        <button
          type="button"
          role="menuitem"
          className="ms-dropdown__item ai-agent-panel-tab-context-menu-danger"
          onClick={closeAllMenuConversations}
        >
          {t('agents.chat.closeAllConversations')}
        </button>
      </div>
    )
  })() : null

  if (!showConversationControls && !showCollapse) return null

  return (
    <AgentHeader className="ai-agent-panel-chat-header">
      <div className="ai-agent-panel-chat-toolbar">
        {showConversationControls && (
          <div className="ai-agent-panel-chat-toolbar-tabs">
            <AgentConversationTabs
              activeConversationId={activeConversation.id}
              conversations={conversationTabs}
              onCloseConversation={onCloseConversation}
              onCloseTabContextMenu={closeTabContextMenu}
              onOpenKeyboardMenu={openConversationTabKeyboardMenu}
              onOpenMenu={openConversationTabMenu}
              onSelectConversation={onSelectConversation}
            />
          </div>
        )}
        {showConversationControls ? tabContextMenuNode : null}
        <div className="ai-agent-panel-chat-toolbar-actions">
          {showConversationControls && (
            <>
              <Button size="icon-sm" variant="ghost" onClick={onNewConversation} aria-label={t('agents.chat.newConversation')} title={t('agents.chat.newConversation')}>
                <Plus size={14} />
              </Button>
              <Button size="icon-sm" variant="ghost" onClick={onBack} aria-label={t('agents.chat.conversationHistory')} title={t('agents.chat.conversationHistory')}>
                <History size={14} />
              </Button>
            </>
          )}
          {showCollapse && (
            <Button size="icon-sm" variant="ghost" onClick={onCollapse} aria-label={t('agents.chat.collapseAssistant')} title={t('agents.chat.collapseAssistant')} className="ai-agent-panel-header-collapse">
              <PanelRightClose size={14} />
            </Button>
          )}
        </div>
      </div>
    </AgentHeader>
  )
}
