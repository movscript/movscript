import type { ClipboardEventHandler, ComponentProps, DragEventHandler, FormEvent, RefObject } from 'react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  AgentComposer,
  AgentComposerDropOverlay,
} from '@/shared/ui/AgentComposerUi'
import {
  AgentSurfaceBlock
} from '@movscript/ui/business/agent'
import {
  Input,
} from '@movscript/ui/primitives'
import { attachmentKey } from '@/features/agent/domain/agentAttachments'
import { RESOURCE_UPLOAD_ACCEPT } from '@/shared/domain/mediaTypes'
import { cn } from '@/shared/ui/cn'
import {
  AgentMentionEditor,
  ComposerAttachmentChip,
  MentionResourceOption,
} from '@/features/agent/components/AgentMentionEditor'
import { AgentComposerToolbarSection } from '@/features/agent/components/AgentComposerToolbarSection'
import { AgentComposerUploadDialog } from '@/features/agent/components/AgentComposerUploadDialog'
import { AgentQueuedInputPreview } from '@/features/agent/components/AgentQueuedInputPreview'
import {
  agentComposerMentionMenuPositionEqual,
  agentComposerMentionMenuPositionFromEditorElement,
  agentComposerMentionMenuStyleFromPosition,
  subscribeAgentComposerMentionMenuPlacement,
  type AgentComposerMentionMenuPosition,
} from '@/features/agent/presentation/agentComposerMentionMenuPlacement'
import type { AgentPendingActiveRunInputQueueItem } from '@movscript/core/agent/protocol'
import {
  type AgentChatQueuedInputPreviewItem,
  type AgentThreadGoalState,
} from '@movscript/core/agent/chat'
import {
  DEFAULT_AGENT_RUN_PROFILE_PRESET_ID,
  agentRunProfilePresetById,
  type AgentRunProfilePresetId,
} from '@/features/agent/domain/agentRunProfilePreset'
import type { AgentAttachment } from '@/features/agent/state/agentStore'
import type { PublicModel } from '@/types'

type MentionStateHandler = ComponentProps<typeof AgentMentionEditor>['onMentionState']

interface WorkspaceContextOption {
  value: string
  label: string
  meta?: string
}

export interface AgentComposerSectionProps {
  chrome?: 'card' | 'bottom-bar' | 'flush'
  answeringPendingInput: boolean
  activePendingInputTitle?: string
  addMentionTrigger: () => void
  buildingSendWorkspace: boolean
  canAnswerPendingInputWithText: boolean
  canSend: boolean
  canStopActiveRun: boolean
  composerAttachmentEntries: { attachment: AgentAttachment }[]
  composerAttachmentsCount: number
  composerInput: string
  composerPlaceholder: string
  debugBeforeSend: boolean
  draggingFiles: boolean
  fileRef: RefObject<HTMLInputElement>
  inputRef: RefObject<HTMLDivElement>
  loading: boolean
  mentionResults: AgentAttachment[]
  mentionRangeActive: boolean
  collaborationMode?: 'default' | 'plan'
  goalModeEnabled?: boolean
  goalState?: AgentThreadGoalState | null
  hideWorkspaceProjectSelector?: boolean
  modelOptions?: PublicModel[]
  modelValue?: string | null
  queuedInputs?: AgentChatQueuedInputPreviewItem[]
  queuedInputsCollapsed?: boolean
  queuedInputSteerEnabled?: boolean
  pendingActiveRunInputQueue: AgentPendingActiveRunInputQueueItem[]
  profilePresetId?: AgentRunProfilePresetId
  stoppingActiveRun: boolean
  uploading: boolean
  uploadedFileCount: number
  uploadingFileNames: string[]
  workspaceProjectOptions?: WorkspaceContextOption[]
  workspaceProjectLocked?: boolean
  workspaceProjectValue?: string
  workspaceProjectsLoading?: boolean
  onAcceptMention: () => boolean
  onComposerDragEnter: DragEventHandler
  onComposerDragLeave: DragEventHandler
  onComposerDragOver: DragEventHandler
  onComposerDrop: DragEventHandler
  onComposerPaste: ClipboardEventHandler
  onDebugBeforeSendChange: (next: boolean) => void
  onInputChange: (value: string) => void
  onMentionEscape: () => void
  onMentionSelect: (attachment: AgentAttachment) => void
  onMentionState: MentionStateHandler
  onCollaborationModeChange?: (mode: 'default' | 'plan') => void
  onGoalModeEnabledChange?: (enabled: boolean) => void
  onModelChange?: (modelId: string | null) => void
  onProfilePresetChange?: (profilePresetId: AgentRunProfilePresetId) => void
  onQueuedInputCollapseChange?: (collapsed: boolean) => void
  onQueuedInputDelete?: (id: string) => void
  onQueuedInputEdit?: (id: string) => void
  onQueuedInputEditCancel?: (id: string) => void
  onQueuedInputSteerNow?: (id: string) => void
  onQueuedInputTextChange?: (id: string, text: string) => void
  onRemoveAttachment: (attachmentId: string) => void
  onSend: (profilePresetId?: AgentRunProfilePresetId) => void
  onStopActiveRun: () => void
  onUploadFiles: (files: FileList) => void
  onWorkspaceProjectChange?: (value: string) => void
  showApprovalPresetSelector?: boolean
  showAttachmentTools?: boolean
  showDebugPreview?: boolean
  showMentionTools?: boolean
}

export function AgentComposerSection({
  chrome = 'card',
  answeringPendingInput,
  addMentionTrigger,
  buildingSendWorkspace,
  canAnswerPendingInputWithText,
  canSend,
  canStopActiveRun,
  composerAttachmentEntries,
  composerAttachmentsCount,
  composerInput,
  composerPlaceholder,
  debugBeforeSend,
  draggingFiles,
  fileRef,
  inputRef,
  loading,
  mentionResults,
  mentionRangeActive,
  collaborationMode = 'default',
  goalModeEnabled = false,
  goalState = null,
  hideWorkspaceProjectSelector = false,
  modelOptions = [],
  modelValue,
  queuedInputs = [],
  queuedInputsCollapsed = false,
  queuedInputSteerEnabled = true,
  pendingActiveRunInputQueue,
  profilePresetId: controlledProfilePresetId,
  stoppingActiveRun,
  uploading,
  uploadedFileCount,
  uploadingFileNames,
  workspaceProjectOptions = [],
  workspaceProjectLocked = false,
  workspaceProjectValue,
  workspaceProjectsLoading = false,
  onAcceptMention,
  onComposerDragEnter,
  onComposerDragLeave,
  onComposerDragOver,
  onComposerDrop,
  onComposerPaste,
  onDebugBeforeSendChange,
  onInputChange,
  onMentionEscape,
  onMentionSelect,
  onMentionState,
  onCollaborationModeChange,
  onGoalModeEnabledChange,
  onModelChange,
  onProfilePresetChange,
  onQueuedInputCollapseChange,
  onQueuedInputDelete,
  onQueuedInputEdit,
  onQueuedInputEditCancel,
  onQueuedInputSteerNow,
  onQueuedInputTextChange,
  onRemoveAttachment,
  onSend,
  onStopActiveRun,
  onUploadFiles,
  onWorkspaceProjectChange,
  showApprovalPresetSelector = true,
  showAttachmentTools = true,
  showDebugPreview = true,
  showMentionTools = true,
}: AgentComposerSectionProps) {
  const { t } = useTranslation()
  const editorDisabled = buildingSendWorkspace || (answeringPendingInput && !canAnswerPendingInputWithText)
  const [mentionMenuPosition, setMentionMenuPosition] = useState<AgentComposerMentionMenuPosition | null>(null)
  const [localProfilePresetId, setLocalProfilePresetId] = useState<AgentRunProfilePresetId>(DEFAULT_AGENT_RUN_PROFILE_PRESET_ID)
  const [draftHasInput, setDraftHasInput] = useState(() => !!composerInput.trim())
  const profilePresetId = controlledProfilePresetId ?? localProfilePresetId
  const runProfile = agentRunProfilePresetById(profilePresetId)
  const mentionMenuOpen = mentionRangeActive && mentionResults.length > 0
  const actionMenuDisabled = answeringPendingInput || uploading || loading || buildingSendWorkspace

  useEffect(() => {
    setDraftHasInput(!!composerInput.trim())
  }, [composerInput])

  useEffect(() => {
    if (!mentionMenuOpen) {
      setMentionMenuPosition((current) => current === null ? current : null)
      return
    }

    function updateMentionMenuPosition() {
      const editor = inputRef.current
      if (!editor) return
      const nextPosition = agentComposerMentionMenuPositionFromEditorElement(editor)
      if (!nextPosition) return

      setMentionMenuPosition((current) => (
        agentComposerMentionMenuPositionEqual(current, nextPosition)
          ? current
          : nextPosition
      ))
    }

    updateMentionMenuPosition()
    return subscribeAgentComposerMentionMenuPlacement(updateMentionMenuPosition)
  }, [inputRef, mentionMenuOpen])

  const mentionMenuPortalTarget = typeof document === 'undefined' ? null : document.body
  const showWorkspaceSelector = !hideWorkspaceProjectSelector
    && workspaceProjectOptions.length > 0
    && workspaceProjectValue !== undefined
    && !!onWorkspaceProjectChange
  const mentionMenu = mentionMenuOpen && mentionMenuPosition && mentionMenuPortalTarget ? createPortal(
    <div
      className="ai-agent-resource-mention-menu overflow-hidden border border-border bg-background shadow-lg"
      style={agentComposerMentionMenuStyleFromPosition(mentionMenuPosition)}
    >
      <div className="ai-agent-resource-mention-menu__header border-b border-border px-2 py-1 type-tiny text-muted-foreground">
        {t('shared.genInput.mention')}
      </div>
      <div className="ai-agent-resource-mention-menu__list overflow-y-auto overscroll-contain">
        {mentionResults.map((attachment) => (
          <MentionResourceOption
            key={attachmentKey(attachment)}
            attachment={attachment}
            onSelect={() => onMentionSelect(attachment)}
          />
        ))}
      </div>
    </div>,
    mentionMenuPortalTarget
  ) : null

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSend(profilePresetId)
  }

  function handleInputChange(nextInput: string) {
    const nextHasInput = !!nextInput.trim()
    setDraftHasInput((current) => current === nextHasInput ? current : nextHasInput)
    onInputChange(nextInput)
  }

  function handleProfilePresetChange(nextProfilePresetId: AgentRunProfilePresetId) {
    if (controlledProfilePresetId === undefined) setLocalProfilePresetId(nextProfilePresetId)
    onProfilePresetChange?.(nextProfilePresetId)
  }

  const canSubmit = canSend || (
    draftHasInput
    && !loading
    && !uploading
    && !buildingSendWorkspace
    && (!answeringPendingInput || canAnswerPendingInputWithText)
  )

  return (
    <AgentSurfaceBlock asChild variant="card">
      <section className={cn('ai-agent-panel-card ai-agent-panel-input-card', `ai-agent-panel-input-card--${chrome}`)} data-chrome={chrome}>
        <AgentComposerUploadDialog
          open={uploading}
          uploadedFileCount={uploadedFileCount}
          uploadingFileNames={uploadingFileNames}
        />
      <AgentQueuedInputPreview
        goal={goalState}
        items={queuedInputs}
        pendingActiveRunItems={pendingActiveRunInputQueue}
        collapsed={queuedInputsCollapsed}
        steerEnabled={queuedInputSteerEnabled}
        onCollapsedChange={onQueuedInputCollapseChange}
        onDelete={onQueuedInputDelete}
        onEdit={onQueuedInputEdit}
        onEditCancel={onQueuedInputEditCancel}
        onSteerNow={onQueuedInputSteerNow}
        onTextChange={onQueuedInputTextChange}
      />
      <AgentComposer
        className={cn('ai-agent-panel-composer ms-agent-composer--panel', draggingFiles && 'ai-agent-panel-composer--dragging')}
        onDragEnter={onComposerDragEnter}
        onDragOver={onComposerDragOver}
        onDragLeave={onComposerDragLeave}
        onDrop={onComposerDrop}
        onPaste={onComposerPaste}
        onSubmit={handleSubmit}
      >
        <Input
          ref={fileRef}
          type="file"
          multiple
          accept={`${RESOURCE_UPLOAD_ACCEPT},.srt`}
          className="hidden"
          onChange={(event) => event.target.files && onUploadFiles(event.target.files)}
        />
        {composerAttachmentEntries.length > 0 && (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {composerAttachmentEntries.map(({ attachment }) => (
              <ComposerAttachmentChip
                key={attachmentKey(attachment)}
                attachment={attachment}
                onRemove={() => onRemoveAttachment(attachment.id)}
              />
            ))}
          </div>
        )}
        <div className="relative">
          <AgentMentionEditor
            editorRef={inputRef}
            placeholder={composerPlaceholder}
            disabled={editorDisabled}
            value={composerInput}
            onChange={handleInputChange}
            onMentionState={onMentionState}
            onEscape={onMentionEscape}
            onAcceptMention={onAcceptMention}
            onSubmit={() => onSend(profilePresetId)}
            onPaste={onComposerPaste}
          />
          {draggingFiles && (
            <AgentComposerDropOverlay>
              {t('agents.chat.dropFilesHere')}
            </AgentComposerDropOverlay>
          )}
          {mentionMenu}
        </div>
        <AgentComposerToolbarSection
          actionMenuDisabled={actionMenuDisabled}
          answeringPendingInput={answeringPendingInput}
          buildingSendWorkspace={buildingSendWorkspace}
          canStopActiveRun={canStopActiveRun}
          canSubmit={canSubmit}
          collaborationMode={collaborationMode}
          composerAttachmentsCount={composerAttachmentsCount}
          debugBeforeSend={debugBeforeSend}
          fileRef={fileRef}
          goalModeEnabled={goalModeEnabled}
          loading={loading}
          modelOptions={modelOptions}
          modelValue={modelValue}
          profilePresetId={profilePresetId}
          runProfile={runProfile}
          showApprovalPresetSelector={showApprovalPresetSelector}
          showAttachmentTools={showAttachmentTools}
          showDebugPreview={showDebugPreview}
          showMentionTools={showMentionTools}
          showWorkspaceSelector={showWorkspaceSelector}
          stoppingActiveRun={stoppingActiveRun}
          uploading={uploading}
          workspaceProjectLocked={workspaceProjectLocked}
          workspaceProjectOptions={workspaceProjectOptions}
          workspaceProjectValue={workspaceProjectValue}
          workspaceProjectsLoading={workspaceProjectsLoading}
          addMentionTrigger={addMentionTrigger}
          onCollaborationModeChange={onCollaborationModeChange}
          onDebugBeforeSendChange={onDebugBeforeSendChange}
          onGoalModeEnabledChange={onGoalModeEnabledChange}
          onModelChange={onModelChange}
          onProfilePresetChange={handleProfilePresetChange}
          onStopActiveRun={onStopActiveRun}
          onWorkspaceProjectChange={onWorkspaceProjectChange}
        />
      </AgentComposer>
      </section>
    </AgentSurfaceBlock>
  )
}
