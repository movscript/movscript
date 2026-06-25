import type { RefObject, UIEventHandler } from 'react'
import {
  AgentEmpty,
  AgentMain,
  AgentShell,
} from '@movscript/ui/business/agent'
import type { AgentConversationTabItem } from '@/features/agent/components/AgentConversationTabsUi'
import {
  AgentChatDataSourcePanelCard,
  AgentChatDataSourceComposerPanel,
  AgentChatDataSourceHistoryPanel,
  AgentChatDataSourcePageThreadShell,
} from '@/features/agent/components/AgentChatDataSourceShellParts'
import type { AgentComposerSectionProps } from '@/features/agent/components/AgentComposerSection'
import type { AgentPinnedStatusSummaryItem } from '@/features/agent/components/AgentPinnedStatusShelf'
import type { useAgentComposerController } from '@/features/agent/presentation/useAgentComposerController'
import type {
  AgentChatCollaborationMode,
  AgentChatDataSource,
  AgentChatRuntimePendingServerRequest,
  AgentChatRuntimeRecentCapabilityEvent,
  AgentChatRuntimeView,
  AgentChatServerRequest,
  AgentChatServerRequestResponse,
  AgentChatThread,
  AgentThreadGoalState,
} from '@movscript/agent-chat'
import type { AgentRunProfilePresetId } from '@/features/agent/domain/agentRunProfilePreset'
import type { PublicModel } from '@/types'
import './AgentChatShellView.css'

type AgentComposerController = ReturnType<typeof useAgentComposerController>
type AgentChatVisibleItem = AgentChatRuntimeView['visibleItems'][number]

export interface AgentChatShellComposerPanelProps {
  composer: AgentComposerController
  fileRef: RefObject<HTMLInputElement | null>
  inputRef: RefObject<HTMLDivElement | null>
  placeholder: string
  workspaceContextLocked: boolean
  hideWorkspaceProjectSelector: boolean
  hasChatContent: boolean
  pendingServerRequests: AgentChatRuntimePendingServerRequest[]
  canSend: boolean
  sendDisabledReason?: string
  canStopActiveRun: boolean
  loading: boolean
  modelOptions: PublicModel[]
  modelValue: string | null | undefined
  collaborationMode: AgentChatCollaborationMode
  goalModeEnabled: boolean
  goalState: AgentThreadGoalState | null
  profilePresetId: AgentRunProfilePresetId
  stoppingActiveRun: boolean
  queuedInputHandlers: {
    onCollapseChange: (collapsed: boolean) => void
    onDelete: (id: string) => void
    onEdit: (id: string) => void
    onEditCancel: (id: string) => void
    onSteerNow: (id: string) => void
    onTextChange: (id: string, text: string) => void
  }
  queuedInputSteerEnabled: boolean
  queuedInputs: AgentComposerSectionProps['queuedInputs']
  queuedInputsCollapsed: boolean
  onDrop: AgentComposerSectionProps['onComposerDrop']
  onPaste: AgentComposerSectionProps['onComposerPaste']
  onCollaborationModeChange?: (mode: AgentChatCollaborationMode) => void
  onGoalModeEnabledChange?: (enabled: boolean) => void
  onModelChange: (modelId: string | null) => void
  onProfilePresetChange: (profilePresetId: AgentRunProfilePresetId) => void
  onResolveServerRequest: (request: AgentChatServerRequest, response: AgentChatServerRequestResponse | undefined) => void
  onSend: (profilePresetId?: AgentRunProfilePresetId) => void
  onStopActiveRun: () => void
}

export interface AgentChatShellHistoryPanelProps {
  open: boolean
  dataSourceLabel: string
  emptyThreadListLabel: string
  endpoint?: string
  hasMoreThreadPages: boolean
  historyThreads: AgentChatThread[]
  loading: boolean
  loadingMore: boolean
  threadListLabel: string
  onLoadMoreThreads: () => Promise<void>
  onLoadThreads: () => Promise<void>
  onOpenThread: (threadId: string) => Promise<void>
  onToggle: () => void
}

export interface AgentChatShellThreadSurfaceProps {
  activeConversationId: string
  conversationTabs: AgentConversationTabItem[]
  emptyThreadLabel?: string
  error: string | null
  hasChatContent: boolean
  recentCapabilityEvents: AgentChatRuntimeRecentCapabilityEvent[]
  scrollRef: { current: HTMLDivElement | null }
  statusItems: AgentPinnedStatusSummaryItem[]
  hiddenItemCount: number
  canLoadEarlierItems: boolean
  visibleItems: AgentChatVisibleItem[]
  onCloseConversation: (threadId: string) => void
  onNewConversation: () => void
  onOpenConversation: (threadId: string) => void
  onReorderConversation: (draggedId: string, targetId: string, position: 'before' | 'after') => void
  onScroll: UIEventHandler<HTMLDivElement>
  onShowOlderItems: () => void
}

export interface AgentChatShellViewProps {
  composerPanel: AgentChatShellComposerPanelProps
  dataSource?: AgentChatDataSource
  error: string | null
  historyPanel: AgentChatShellHistoryPanelProps
  resolvedHost: 'dock-panel' | 'floating-panel' | 'immersive'
  shellClassName: string
  surface: 'panel' | 'page'
  threadSurface: AgentChatShellThreadSurfaceProps
  unavailableLabel: string
}

export function AgentChatShellView({
  composerPanel,
  dataSource,
  error,
  historyPanel,
  resolvedHost,
  shellClassName,
  surface,
  threadSurface,
  unavailableLabel,
}: AgentChatShellViewProps) {
  if (!dataSource) {
    return (
      <AgentShell density="compact" className={shellClassName}>
        <AgentMain className={surface === 'page' ? 'agent-page-chat-main' : 'ai-agent-panel-main'} data-agent-chat-host={resolvedHost}>
          <AgentEmpty role="status" aria-live="polite">
            <span>{error || unavailableLabel}</span>
          </AgentEmpty>
        </AgentMain>
      </AgentShell>
    )
  }

  const { composer } = composerPanel

  return (
    <AgentShell density="compact" data-agent-chat-host={resolvedHost} className={shellClassName}>
      <AgentMain
        className={surface === 'page' ? 'agent-page-chat-main' : 'ai-agent-panel-main'}
        data-agent-chat-host={resolvedHost}
      >
        {surface === 'panel' ? (
          <AgentChatDataSourcePanelCard
            activeConversationId={threadSurface.activeConversationId}
            conversationTabs={threadSurface.conversationTabs}
            conversationTabsLabel={historyPanel.threadListLabel}
            emptyThreadLabel={threadSurface.emptyThreadLabel}
            error={threadSurface.error}
            hasChatContent={threadSurface.hasChatContent}
            historyOpen={historyPanel.open}
            recentCapabilityEvents={threadSurface.recentCapabilityEvents}
            scrollRef={threadSurface.scrollRef}
            statusItems={threadSurface.statusItems}
            hiddenItemCount={threadSurface.hiddenItemCount}
            canLoadEarlierItems={threadSurface.canLoadEarlierItems}
            visibleItems={threadSurface.visibleItems}
            onCloseConversation={threadSurface.onCloseConversation}
            onNewConversation={threadSurface.onNewConversation}
            onOpenConversation={threadSurface.onOpenConversation}
            onReorderConversation={threadSurface.onReorderConversation}
            onScroll={threadSurface.onScroll}
            onShowOlderItems={threadSurface.onShowOlderItems}
            onToggleHistory={historyPanel.onToggle}
          />
        ) : (
          <AgentChatDataSourcePageThreadShell
            ariaLabel={composerPanel.placeholder}
            emptyThreadLabel={threadSurface.emptyThreadLabel}
            error={threadSurface.error}
            hasChatContent={threadSurface.hasChatContent}
            recentCapabilityEvents={threadSurface.recentCapabilityEvents}
            scrollRef={threadSurface.scrollRef}
            statusItems={threadSurface.statusItems}
            hiddenItemCount={threadSurface.hiddenItemCount}
            canLoadEarlierItems={threadSurface.canLoadEarlierItems}
            visibleItems={threadSurface.visibleItems}
            onScroll={threadSurface.onScroll}
            onShowOlderItems={threadSurface.onShowOlderItems}
          />
        )}
        <AgentChatDataSourceComposerPanel
          hasChatContent={composerPanel.hasChatContent}
          pendingServerRequests={composerPanel.pendingServerRequests}
          surface={surface}
          onResolveServerRequest={composerPanel.onResolveServerRequest}
          answeringPendingInput={false}
          addMentionTrigger={composer.addMentionTrigger}
          buildingSendWorkspace={false}
          canSend={composerPanel.canSend}
          sendDisabledReason={composerPanel.sendDisabledReason}
          canAnswerPendingInputWithText={false}
          canStopActiveRun={composerPanel.canStopActiveRun}
          chrome="flush"
          composerAttachmentEntries={composer.composerAttachmentEntries}
          composerAttachmentsCount={composer.composerAttachments.length}
          composerInput={composer.input}
          composerPlaceholder={composerPanel.placeholder}
          debugBeforeSend={false}
          draggingFiles={composer.draggingFiles}
          fileRef={composerPanel.fileRef as AgentComposerSectionProps['fileRef']}
          inputRef={composerPanel.inputRef as AgentComposerSectionProps['inputRef']}
          loading={composerPanel.loading}
          mentionRangeActive={!!composer.mentionRange}
          mentionResults={composer.mentionResults}
          modelOptions={composerPanel.modelOptions}
          modelValue={composerPanel.modelValue}
          collaborationMode={composerPanel.collaborationMode}
          goalModeEnabled={composerPanel.goalModeEnabled}
          goalState={composerPanel.goalState}
          hideWorkspaceProjectSelector={composerPanel.hideWorkspaceProjectSelector}
          queuedInputs={composerPanel.queuedInputs}
          queuedInputsCollapsed={composerPanel.queuedInputsCollapsed}
          queuedInputSteerEnabled={composerPanel.queuedInputSteerEnabled}
          pendingActiveRunInputQueue={[]}
          profilePresetId={composerPanel.profilePresetId}
          stoppingActiveRun={composerPanel.stoppingActiveRun}
          uploadedFileCount={composer.uploadedFileCount}
          uploading={composer.uploading}
          uploadingFileNames={composer.uploadingFileNames}
          workspaceProjectOptions={composer.workspaceProjectOptions}
          workspaceProjectLocked={composerPanel.workspaceContextLocked}
          workspaceProjectValue={composer.workspaceProjectValue}
          workspaceProjectsLoading={composer.workspaceProjectsLoading}
          onAcceptMention={() => {
            if (composer.mentionRange && composer.mentionResults.length > 0) {
              composer.insertResourceMention(composer.mentionResults[0])
              return true
            }
            return false
          }}
          onComposerDragEnter={composer.handleComposerDragEnter}
          onComposerDragLeave={composer.handleComposerDragLeave}
          onComposerDragOver={composer.handleComposerDragOver}
          onComposerDrop={composerPanel.onDrop}
          onComposerPaste={composerPanel.onPaste}
          onDebugBeforeSendChange={() => undefined}
          onInputChange={composer.updateInputDraft}
          onMentionEscape={() => composer.setMentionRange(null)}
          onMentionSelect={composer.insertResourceMention}
          onMentionState={composer.updateMentionState}
          onCollaborationModeChange={composerPanel.onCollaborationModeChange}
          onGoalModeEnabledChange={composerPanel.onGoalModeEnabledChange}
          onModelChange={composerPanel.onModelChange}
          onProfilePresetChange={composerPanel.onProfilePresetChange}
          onQueuedInputCollapseChange={composerPanel.queuedInputHandlers.onCollapseChange}
          onQueuedInputDelete={composerPanel.queuedInputHandlers.onDelete}
          onQueuedInputEdit={composerPanel.queuedInputHandlers.onEdit}
          onQueuedInputEditCancel={composerPanel.queuedInputHandlers.onEditCancel}
          onQueuedInputSteerNow={composerPanel.queuedInputHandlers.onSteerNow}
          onQueuedInputTextChange={composerPanel.queuedInputHandlers.onTextChange}
          onRemoveAttachment={composer.removeAttachment}
          onSend={composerPanel.onSend}
          onStopActiveRun={composerPanel.onStopActiveRun}
          onUploadFiles={(files) => void composer.uploadFiles(files)}
          onWorkspaceProjectChange={composer.changeWorkspaceProject}
          showApprovalPresetSelector
          showAttachmentTools
          showDebugPreview={false}
          showMentionTools
        />
        {surface === 'panel' && historyPanel.open ? (
          <AgentChatDataSourceHistoryPanel
            dataSourceLabel={historyPanel.dataSourceLabel}
            emptyThreadListLabel={historyPanel.emptyThreadListLabel}
            endpoint={historyPanel.endpoint}
            hasMoreThreadPages={historyPanel.hasMoreThreadPages}
            historyThreads={historyPanel.historyThreads}
            loading={historyPanel.loading}
            loadingMore={historyPanel.loadingMore}
            threadListLabel={historyPanel.threadListLabel}
            onLoadMoreThreads={historyPanel.onLoadMoreThreads}
            onLoadThreads={historyPanel.onLoadThreads}
            onOpenThread={historyPanel.onOpenThread}
          />
        ) : null}
      </AgentMain>
    </AgentShell>
  )
}
