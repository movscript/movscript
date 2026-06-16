import type { ComponentProps, ReactNode } from 'react'
import { SquarePen } from 'lucide-react'

import {
  AgentModeIconSlot,
  AgentModeLabel,
  AgentModePrimaryNavItem,
  AgentModeResizeHandle,
  AgentModeSidebar,
  AgentModeSidebarScroll,
  AgentModeSidebarTop,
} from '@/features/agent/components/AgentModeUi'
import {
  ProjectAgentModeChatConversationsSection,
  ProjectAgentModeHistorySection,
  ProjectAgentModeProjectGroupsSection,
  type AgentModeHistoryItem,
  type AgentModeProjectConversationGroup,
} from '@/features/agent/components/ProjectAgentModeSidebarParts'
import type { Conversation } from '@/features/agent/state/agentStore'
import type { AgentThreadSummary } from '@/shared/infrastructure/providerSessionClient'
import type { ProviderSessionStatusLight } from '@movscript/core/agent'

export function ProjectAgentModeSidebarView({
  headerActions,
  resizing,
  sidebarWidth,
  resizeHandleProps,
  projectGroups,
  openProjectGroups,
  expandedProjectThreadGroups,
  activeConversationId,
  locale,
  now,
  providerSessionStatusLights,
  chatConversationsOpen,
  sortedChatConversations,
  visibleChatConversations,
  hiddenChatConversationCount,
  showAllChatConversations,
  historyOpen,
  historyItems,
  visibleHistoryItems,
  hiddenHistoryItemCount,
  showAllHistoryConversations,
  sourceThreadsLoading,
  labels,
  onStartConversation,
  onToggleProjectGroup,
  onToggleProjectThreadGroup,
  onSelectConversation,
  onArchiveConversation,
  onChatConversationsOpenChange,
  onToggleShowAllChatConversations,
  onHistoryOpenChange,
  onToggleShowAllHistoryConversations,
  onDeleteConversation,
  onRestoreThread,
  onDeleteThread,
  getConversationTitle,
  getThreadTitle,
  getThreadDescription,
}: {
  headerActions?: ReactNode
  resizing: boolean
  sidebarWidth: number
  resizeHandleProps: ComponentProps<typeof AgentModeResizeHandle>
  projectGroups: AgentModeProjectConversationGroup[]
  openProjectGroups: Record<number, boolean>
  expandedProjectThreadGroups: Record<number, boolean>
  activeConversationId: string | null
  locale: string
  now: number
  providerSessionStatusLights: Record<string, ProviderSessionStatusLight | undefined>
  chatConversationsOpen: boolean
  sortedChatConversations: Conversation[]
  visibleChatConversations: Conversation[]
  hiddenChatConversationCount: number
  showAllChatConversations: boolean
  historyOpen: boolean
  historyItems: AgentModeHistoryItem[]
  visibleHistoryItems: AgentModeHistoryItem[]
  hiddenHistoryItemCount: number
  showAllHistoryConversations: boolean
  sourceThreadsLoading: boolean
  labels: {
    startConversation: string
    projectHeading: string
    noProjectConversations: string
    archiveConversation: string
    collapseProjectConversations: string
    expandProjectConversations: string
    conversations: string
    showFewerConversations: string
    showMoreConversations: (count: number) => string
    history: string
    loading: string
    noHistoryConversations: string
    deleteConversation: string
  }
  onStartConversation: () => void
  onToggleProjectGroup: (projectId: number) => void
  onToggleProjectThreadGroup: (projectId: number) => void
  onSelectConversation: (conversationId: string) => void
  onArchiveConversation: (conversation: Conversation) => void
  onChatConversationsOpenChange: (open: boolean) => void
  onToggleShowAllChatConversations: () => void
  onHistoryOpenChange: (open: boolean) => void
  onToggleShowAllHistoryConversations: () => void
  onDeleteConversation: (conversation: Conversation) => void
  onRestoreThread: (threadId: string) => void
  onDeleteThread: (threadId: string) => void
  getConversationTitle: (conversation: Conversation) => string
  getThreadTitle: (thread: AgentThreadSummary) => string
  getThreadDescription: (thread: AgentThreadSummary) => string
}) {
  return (
    <AgentModeSidebar
      resizing={resizing}
      width={sidebarWidth}
    >
      <AgentModeSidebarTop>
        {headerActions ? (
          <div className="agent-mode-sidebar__header-actions">
            {headerActions}
          </div>
        ) : null}
        <AgentModePrimaryNavItem
          onClick={onStartConversation}
          title={labels.startConversation}
        >
          <AgentModeIconSlot><SquarePen size={18} /></AgentModeIconSlot>
          <AgentModeLabel>新对话</AgentModeLabel>
        </AgentModePrimaryNavItem>
      </AgentModeSidebarTop>

      <AgentModeSidebarScroll>
        <div className="agent-mode-sidebar-project-heading">
          <span>{labels.projectHeading}</span>
        </div>
        <ProjectAgentModeProjectGroupsSection
          groups={projectGroups}
          openProjectGroups={openProjectGroups}
          expandedProjectThreadGroups={expandedProjectThreadGroups}
          activeConversationId={activeConversationId}
          locale={locale}
          now={now}
          providerSessionStatusLights={providerSessionStatusLights}
          labels={{
            noProjectConversations: labels.noProjectConversations,
            archiveConversation: labels.archiveConversation,
            collapseProjectConversations: labels.collapseProjectConversations,
            expandProjectConversations: labels.expandProjectConversations,
          }}
          onToggleProjectGroup={onToggleProjectGroup}
          onToggleProjectThreadGroup={onToggleProjectThreadGroup}
          onSelectConversation={onSelectConversation}
          onArchiveConversation={onArchiveConversation}
          getConversationTitle={getConversationTitle}
        />

        <ProjectAgentModeChatConversationsSection
          open={chatConversationsOpen}
          conversations={sortedChatConversations}
          visibleConversations={visibleChatConversations}
          hiddenConversationCount={hiddenChatConversationCount}
          showAllConversations={showAllChatConversations}
          activeConversationId={activeConversationId}
          locale={locale}
          now={now}
          providerSessionStatusLights={providerSessionStatusLights}
          labels={{
            conversations: labels.conversations,
            startConversation: labels.startConversation,
            archiveConversation: labels.archiveConversation,
            showFewerConversations: labels.showFewerConversations,
            showMoreConversations: labels.showMoreConversations,
          }}
          onOpenChange={onChatConversationsOpenChange}
          onStartConversation={onStartConversation}
          onToggleShowAll={onToggleShowAllChatConversations}
          onSelectConversation={onSelectConversation}
          onArchiveConversation={onArchiveConversation}
          getConversationTitle={getConversationTitle}
        />

        <ProjectAgentModeHistorySection
          open={historyOpen}
          items={historyItems}
          visibleItems={visibleHistoryItems}
          hiddenItemCount={hiddenHistoryItemCount}
          showAllItems={showAllHistoryConversations}
          activeConversationId={activeConversationId}
          locale={locale}
          now={now}
          loading={sourceThreadsLoading}
          labels={{
            history: labels.history,
            loading: labels.loading,
            noHistoryConversations: labels.noHistoryConversations,
            archiveConversation: labels.archiveConversation,
            deleteConversation: labels.deleteConversation,
            showFewerConversations: labels.showFewerConversations,
            showMoreConversations: labels.showMoreConversations,
          }}
          onOpenChange={onHistoryOpenChange}
          onToggleShowAll={onToggleShowAllHistoryConversations}
          onSelectConversation={onSelectConversation}
          onDeleteConversation={onDeleteConversation}
          onRestoreThread={onRestoreThread}
          onDeleteThread={onDeleteThread}
          getConversationTitle={getConversationTitle}
          getThreadTitle={getThreadTitle}
          getThreadDescription={getThreadDescription}
        />

      </AgentModeSidebarScroll>

      <AgentModeResizeHandle
        {...resizeHandleProps}
        side="right"
      />
    </AgentModeSidebar>
  )
}
