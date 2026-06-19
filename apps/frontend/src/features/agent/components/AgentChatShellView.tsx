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
  AgentChatVisibleItemWindow,
  AgentThreadGoalState,
} from '@movscript/core/agent/chat'
import type { AgentRunProfilePresetId } from '@/features/agent/domain/agentRunProfilePreset'
import type { PublicModel } from '@/types'
import './AgentChatShellView.css'

type AgentComposerController = ReturnType<typeof useAgentComposerController>
type AgentChatVisibleItem = AgentChatRuntimeView['visibleItems'][number]

interface AgentChatShellViewProps {
  activeThread: AgentChatThread | null
  activeThreadId: string | null
  activeThreadModelValue: string | null | undefined
  canSend: boolean
  canShowOlderThreadItems: boolean
  canStopActiveTurn: boolean
  closedHistoryThreads: AgentChatThread[]
  collaborationMode: AgentChatCollaborationMode
  composer: AgentComposerController
  composerFileRef: RefObject<HTMLInputElement | null>
  composerInputRef: RefObject<HTMLDivElement | null>
  composerPlaceholder: string
  composerWorkspaceContextLocked: boolean
  dataSource?: AgentChatDataSource
  emptyThreadListLabel: string
  endpoint?: string
  error: string | null
  goalModeEnabled: boolean
  handleModelChange: (modelId: string | null) => void
  handleProfilePresetChange: (profilePresetId: AgentRunProfilePresetId) => void
  hasChatContent: boolean
  hideComposerWorkspaceProjectSelector: boolean
  historyOpen: boolean
  loading: boolean
  modelOptions: PublicModel[]
  profilePresetId: AgentRunProfilePresetId
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
  recentCapabilityEvents: AgentChatRuntimeRecentCapabilityEvent[]
  reorderThreadTab: (draggedId: string, targetId: string, position: 'before' | 'after') => void
  resolvedEmptyThreadLabel?: string
  resolvedHost: 'dock-panel' | 'floating-panel' | 'immersive'
  scrollRef: { current: HTMLDivElement | null }
  sending: boolean
  shellClassName: string
  showOlderThreadItems: () => void
  stoppingTurn: boolean
  surface: 'panel' | 'page'
  threadListLabel: string
  threadListLoadingMore: boolean
  threadListNextCursor: string | null | undefined
  threadTabs: AgentConversationTabItem[]
  unavailableLabel: string
  visibleItemWindow: Pick<AgentChatVisibleItemWindow<AgentChatVisibleItem>, 'hiddenCount'>
  visibleItems: AgentChatVisibleItem[]
  visiblePendingServerRequests: AgentChatRuntimePendingServerRequest[]
  visibleStatusItems: AgentPinnedStatusSummaryItem[]
  onCloseThreadTab: (threadId: string) => void
  onCollaborationModeChange?: (mode: AgentChatCollaborationMode) => void
  onComposerDrop: AgentComposerSectionProps['onComposerDrop']
  onComposerPaste: AgentComposerSectionProps['onComposerPaste']
  onGoalModeEnabledChange?: (enabled: boolean) => void
  onLoadMoreThreads: () => Promise<void>
  onLoadThreads: () => Promise<void>
  onNewConversation: () => void
  onOpenThread: (threadId: string) => Promise<void>
  onResolveServerRequest: (request: AgentChatServerRequest, response: AgentChatServerRequestResponse | undefined) => void
  onScroll: UIEventHandler<HTMLDivElement>
  onSend: (profilePresetId?: AgentRunProfilePresetId) => void
  onStopActiveTurn: () => void
  onToggleHistory: () => void
}

export function AgentChatShellView({
  activeThread,
  activeThreadId,
  activeThreadModelValue,
  canSend,
  canShowOlderThreadItems,
  canStopActiveTurn,
  closedHistoryThreads,
  collaborationMode,
  composer,
  composerFileRef,
  composerInputRef,
  composerPlaceholder,
  composerWorkspaceContextLocked,
  dataSource,
  emptyThreadListLabel,
  endpoint,
  error,
  goalModeEnabled,
  handleModelChange,
  handleProfilePresetChange,
  hasChatContent,
  hideComposerWorkspaceProjectSelector,
  historyOpen,
  loading,
  modelOptions,
  profilePresetId,
  queuedInputHandlers,
  queuedInputSteerEnabled,
  queuedInputs,
  queuedInputsCollapsed,
  recentCapabilityEvents,
  reorderThreadTab,
  resolvedEmptyThreadLabel,
  resolvedHost,
  scrollRef,
  sending,
  shellClassName,
  showOlderThreadItems,
  stoppingTurn,
  surface,
  threadListLabel,
  threadListLoadingMore,
  threadListNextCursor,
  threadTabs,
  unavailableLabel,
  visibleItemWindow,
  visibleItems,
  visiblePendingServerRequests,
  visibleStatusItems,
  onCloseThreadTab,
  onCollaborationModeChange,
  onComposerDrop,
  onComposerPaste,
  onGoalModeEnabledChange,
  onLoadMoreThreads,
  onLoadThreads,
  onNewConversation,
  onOpenThread,
  onResolveServerRequest,
  onScroll,
  onSend,
  onStopActiveTurn,
  onToggleHistory,
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

  const goalState: AgentThreadGoalState | null = activeThread?.goal ?? null

  return (
    <AgentShell density="compact" data-agent-chat-host={resolvedHost} className={shellClassName}>
      <AgentMain
        className={surface === 'page' ? 'agent-page-chat-main' : 'ai-agent-panel-main'}
        data-agent-chat-host={resolvedHost}
      >
        {surface === 'panel' ? (
          <AgentChatDataSourcePanelCard
            activeConversationId={activeThreadId ?? '__draft__'}
            conversationTabs={threadTabs}
            conversationTabsLabel={threadListLabel}
            emptyThreadLabel={resolvedEmptyThreadLabel}
            error={error}
            hasChatContent={hasChatContent}
            historyOpen={historyOpen}
            recentCapabilityEvents={recentCapabilityEvents}
            scrollRef={scrollRef}
            statusItems={visibleStatusItems}
            hiddenItemCount={visibleItemWindow.hiddenCount}
            canLoadEarlierItems={canShowOlderThreadItems}
            visibleItems={visibleItems}
            onCloseConversation={onCloseThreadTab}
            onNewConversation={onNewConversation}
            onOpenConversation={(threadId) => void onOpenThread(threadId)}
            onReorderConversation={reorderThreadTab}
            onScroll={onScroll}
            onShowOlderItems={showOlderThreadItems}
            onToggleHistory={onToggleHistory}
          />
        ) : (
          <AgentChatDataSourcePageThreadShell
            ariaLabel={composerPlaceholder}
            emptyThreadLabel={resolvedEmptyThreadLabel}
            error={error}
            hasChatContent={hasChatContent}
            recentCapabilityEvents={recentCapabilityEvents}
            scrollRef={scrollRef}
            statusItems={visibleStatusItems}
            hiddenItemCount={visibleItemWindow.hiddenCount}
            canLoadEarlierItems={canShowOlderThreadItems}
            visibleItems={visibleItems}
            onScroll={onScroll}
            onShowOlderItems={showOlderThreadItems}
          />
        )}
        <AgentChatDataSourceComposerPanel
          hasChatContent={hasChatContent}
          pendingServerRequests={visiblePendingServerRequests}
          surface={surface}
          onResolveServerRequest={onResolveServerRequest}
          answeringPendingInput={false}
          addMentionTrigger={composer.addMentionTrigger}
          buildingSendWorkspace={false}
          canSend={canSend}
          canAnswerPendingInputWithText={false}
          canStopActiveRun={canStopActiveTurn}
          chrome="flush"
          composerAttachmentEntries={composer.composerAttachmentEntries}
          composerAttachmentsCount={composer.composerAttachments.length}
          composerInput={composer.input}
          composerPlaceholder={composerPlaceholder}
          debugBeforeSend={false}
          draggingFiles={composer.draggingFiles}
          fileRef={composerFileRef as AgentComposerSectionProps['fileRef']}
          inputRef={composerInputRef as AgentComposerSectionProps['inputRef']}
          loading={sending}
          mentionRangeActive={!!composer.mentionRange}
          mentionResults={composer.mentionResults}
          modelOptions={modelOptions}
          modelValue={activeThreadModelValue}
          collaborationMode={collaborationMode}
          goalModeEnabled={goalModeEnabled}
          goalState={goalState}
          hideWorkspaceProjectSelector={hideComposerWorkspaceProjectSelector}
          queuedInputs={queuedInputs}
          queuedInputsCollapsed={queuedInputsCollapsed}
          queuedInputSteerEnabled={queuedInputSteerEnabled}
          pendingActiveRunInputQueue={[]}
          profilePresetId={profilePresetId}
          stoppingActiveRun={stoppingTurn}
          uploadedFileCount={composer.uploadedFileCount}
          uploading={composer.uploading}
          uploadingFileNames={composer.uploadingFileNames}
          workspaceProjectOptions={composer.workspaceProjectOptions}
          workspaceProjectLocked={composerWorkspaceContextLocked}
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
          onComposerDrop={onComposerDrop}
          onComposerPaste={onComposerPaste}
          onDebugBeforeSendChange={() => undefined}
          onInputChange={composer.updateInputDraft}
          onMentionEscape={() => composer.setMentionRange(null)}
          onMentionSelect={composer.insertResourceMention}
          onMentionState={composer.updateMentionState}
          onCollaborationModeChange={onCollaborationModeChange}
          onGoalModeEnabledChange={onGoalModeEnabledChange}
          onModelChange={handleModelChange}
          onProfilePresetChange={handleProfilePresetChange}
          onQueuedInputCollapseChange={queuedInputHandlers.onCollapseChange}
          onQueuedInputDelete={queuedInputHandlers.onDelete}
          onQueuedInputEdit={queuedInputHandlers.onEdit}
          onQueuedInputEditCancel={queuedInputHandlers.onEditCancel}
          onQueuedInputSteerNow={queuedInputHandlers.onSteerNow}
          onQueuedInputTextChange={queuedInputHandlers.onTextChange}
          onRemoveAttachment={composer.removeAttachment}
          onSend={onSend}
          onStopActiveRun={onStopActiveTurn}
          onUploadFiles={(files) => void composer.uploadFiles(files)}
          onWorkspaceProjectChange={composer.changeWorkspaceProject}
          showApprovalPresetSelector
          showAttachmentTools
          showDebugPreview={false}
          showMentionTools
        />
        {surface === 'panel' && historyOpen ? (
          <AgentChatDataSourceHistoryPanel
            dataSourceLabel={dataSource.label}
            emptyThreadListLabel={emptyThreadListLabel}
            endpoint={endpoint}
            hasMoreThreadPages={Boolean(threadListNextCursor)}
            historyThreads={closedHistoryThreads}
            loading={loading}
            loadingMore={threadListLoadingMore}
            threadListLabel={threadListLabel}
            onLoadMoreThreads={onLoadMoreThreads}
            onLoadThreads={onLoadThreads}
            onOpenThread={onOpenThread}
          />
        ) : null}
      </AgentMain>
    </AgentShell>
  )
}
