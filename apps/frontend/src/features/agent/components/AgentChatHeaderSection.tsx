import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { PanelRightClose } from 'lucide-react'
import { AgentHeader } from '@movscript/ui/business/agent'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@movscript/ui/primitives'
import { AgentConversationTabs } from '@/features/agent/components/AgentConversationTabs'
import {
  agentConversationTabMenuAnchorStyleFromPosition,
  agentConversationTabMenuPositionFromPointerEvent,
  agentConversationTabMenuPositionFromTriggerElement,
} from '@/features/agent/presentation/agentConversationTabMenuPlacement'
import { useAgentConversationTabProviderSessionStatusLights } from '@/features/agent/presentation/useAgentConversationTabProviderSessionStatusLights'
import { subscribeTransientOverlayDismissal } from '@/shared/ui/transientOverlayDismissal'
import type { ProviderSessionStatusLight } from '@movscript/core/agent'
import type { Conversation } from '@/features/agent/state/agentStore'

type ConversationTabMenuState = {
  conversationId: string
  x: number
  y: number
} | null

export interface AgentChatHeaderSectionProps {
  activeConversation: Conversation
  conversations: Conversation[]
  onBack: () => void
  onCloseConversation: (id: string) => void
  onCloseConversations: (ids: string[]) => void
  onCollapse: () => void
  showCollapse?: boolean
  showConversationControls?: boolean
  historyOpen?: boolean
  activeConversationProviderSessionStatusLight?: ProviderSessionStatusLight
  pinnedStatusExpanded?: boolean
  showPinnedStatusControl?: boolean
  onNewConversation: () => void
  onRenameConversation: (id: string, title: string) => void
  onReorderConversation: (draggedId: string, targetId: string, position: 'before' | 'after') => void
  onSelectConversation: (id: string) => void
  onTogglePinnedStatus?: () => void
  onToggleHistory?: () => void
}

export function AgentChatHeaderSection({
  activeConversation,
  conversations,
  onCloseConversation,
  onCloseConversations,
  onCollapse,
  showCollapse = true,
  showConversationControls = true,
  activeConversationProviderSessionStatusLight,
  historyOpen,
  onRenameConversation,
  onReorderConversation,
  onSelectConversation,
  onNewConversation,
  onToggleHistory,
}: AgentChatHeaderSectionProps) {
  const { t } = useTranslation()
  const conversationTabs = useMemo(() => {
    const hasActiveConversation = conversations.some((item) => item.id === activeConversation.id)
    const mapped = conversations.map((item) => item.id === activeConversation.id ? { ...item, ...activeConversation } : item)
    return hasActiveConversation ? mapped : [activeConversation, ...mapped]
  }, [activeConversation, conversations])
  const tabProviderSessionStatusLights = useAgentConversationTabProviderSessionStatusLights(conversationTabs)
  const providerSessionStatusLights = useMemo(() => {
    if (!activeConversationProviderSessionStatusLight) return tabProviderSessionStatusLights
    if (activeConversationProviderSessionStatusLight.state === 'stopped' && tabProviderSessionStatusLights[activeConversation.id]) return tabProviderSessionStatusLights
    return { ...tabProviderSessionStatusLights, [activeConversation.id]: activeConversationProviderSessionStatusLight }
  }, [activeConversation.id, activeConversationProviderSessionStatusLight, tabProviderSessionStatusLights])
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
    const position = agentConversationTabMenuPositionFromPointerEvent(event)
    setTabContextMenu({
      conversationId,
      x: position.x,
      y: position.y,
    })
  }, [])
  const openConversationTabKeyboardMenu = useCallback((event: KeyboardEvent, conversationId: string) => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
    event.preventDefault()
    event.stopPropagation()
    const position = agentConversationTabMenuPositionFromTriggerElement(event.currentTarget)
    setTabContextMenu({
      conversationId,
      x: position.x,
      y: position.y,
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
    return subscribeTransientOverlayDismissal({
      onDismiss: () => setTabContextMenu(null),
    })
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
      <DropdownMenu open onOpenChange={(open) => { if (!open) closeTabContextMenu() }}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t('agents.chat.tabActions')}
            className="ai-agent-panel-tab-context-menu-anchor"
            style={agentConversationTabMenuAnchorStyleFromPosition(tabContextMenu)}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="bottom"
          sideOffset={0}
          className="ai-agent-panel-tab-context-dropdown"
          onCloseAutoFocus={(event) => event.preventDefault()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <DropdownMenuItem onSelect={closeMenuConversation}>
            {t('agents.chat.archiveConversation')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={conversationTabs.length <= 1}
            onSelect={closeOtherMenuConversations}
          >
            {t('agents.chat.archiveOtherConversations')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!hasRightTabs}
            onSelect={closeRightMenuConversations}
          >
            {t('agents.chat.archiveRightConversations')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={closeAllMenuConversations}
          >
            {t('agents.chat.archiveAllConversations')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
              providerSessionStatusLights={providerSessionStatusLights}
              onCloseConversation={onCloseConversation}
              onCloseTabContextMenu={closeTabContextMenu}
              onOpenKeyboardMenu={openConversationTabKeyboardMenu}
              onOpenMenu={openConversationTabMenu}
              onNewConversation={onNewConversation}
              onRenameConversation={onRenameConversation}
              onReorderConversation={onReorderConversation}
              onSelectConversation={onSelectConversation}
              onToggleHistory={onToggleHistory}
              historyOpen={historyOpen}
            />
          </div>
        )}
        {showConversationControls ? tabContextMenuNode : null}
        {showCollapse && (
          <div className="ai-agent-panel-chat-toolbar-actions">
            <Button size="icon-sm" variant="ghost" onClick={onCollapse} aria-label={t('agents.chat.collapseAssistant')} title={t('agents.chat.collapseAssistant')} className="ai-agent-panel-header-collapse">
              <PanelRightClose size={14} />
            </Button>
          </div>
        )}
      </div>
    </AgentHeader>
  )
}
