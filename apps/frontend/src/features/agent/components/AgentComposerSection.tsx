import type { ClipboardEventHandler, ComponentProps, DragEventHandler, FormEvent, RefObject } from 'react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { AtSign, Check, ChevronDown, CircleDot, CircleStop, Eye, Hand, Loader2, Mic, Paperclip, Plus, Send, Sparkles } from 'lucide-react'
import {
  AgentComposer,
  AgentComposerAction,
  AgentComposerDropOverlay,
  AgentComposerSubmit,
  AgentComposerToolbar,
  AgentSurfaceBlock
} from '@movscript/ui/business/agent'
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger
} from '@movscript/ui/primitives'
import { attachmentKey } from '@/features/agent/domain/agentAttachments'
import { RESOURCE_UPLOAD_ACCEPT } from '@/shared/domain/mediaTypes'
import { cn } from '@/shared/ui/cn'
import {
  AgentMentionEditor,
  ComposerAttachmentChip,
  MentionResourceOption,
} from '@/features/agent/components/AgentMentionEditor'
import { AgentComposerModelSelector } from '@/features/agent/components/AgentComposerModelSelector'
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
  AGENT_RUN_PROFILE_PRESETS,
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
  modelValue?: number | null
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
  onModelChange?: (modelId: number | null) => void
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
  const workspaceSelectorDisabled = answeringPendingInput || buildingSendWorkspace || loading
  const showWorkspaceSelector = !hideWorkspaceProjectSelector
    && workspaceProjectOptions.length > 0
    && workspaceProjectValue !== undefined
    && !!onWorkspaceProjectChange
  const selectedWorkspaceProjectOption = showWorkspaceSelector
    ? workspaceProjectOptions.find((option) => option.value === workspaceProjectValue)
    : undefined
  const selectedWorkspaceProjectLabel = selectedWorkspaceProjectOption
    ? selectedWorkspaceProjectOption.label
    : workspaceProjectValue
  const selectedWorkspaceProjectTitle = selectedWorkspaceProjectOption
    ? [selectedWorkspaceProjectOption.label, selectedWorkspaceProjectOption.meta].filter(Boolean).join(' / ')
    : workspaceProjectValue
  const runProfileDisplayLabel = runProfile.id === 'default' ? '默认权限' : runProfile.label
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
        <AgentComposerToolbar>
          <div className="ms-agent-composer__toolstrip flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {showAttachmentTools || showMentionTools || onCollaborationModeChange || onGoalModeEnabledChange ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <AgentComposerAction
                    disabled={actionMenuDisabled}
                    aria-label="Composer actions"
                    title="Composer actions"
                  >
                    {uploading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={16} />}
                  </AgentComposerAction>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" className="min-w-72">
                  <DropdownMenuLabel>Input Controls</DropdownMenuLabel>
                  {showAttachmentTools ? (
                    <DropdownMenuItem
                      onSelect={() => fileRef.current?.click()}
                      disabled={uploading || loading || buildingSendWorkspace}
                      className="gap-2"
                    >
                      <Paperclip size={14} />
                      <span>{t('agents.chat.uploadAttachment')}</span>
                    </DropdownMenuItem>
                  ) : null}
                  {showMentionTools ? (
                    <DropdownMenuItem
                      onSelect={addMentionTrigger}
                      disabled={buildingSendWorkspace}
                      className="gap-2"
                    >
                      <AtSign size={14} />
                      <span>{t('shared.genInput.mention')}</span>
                    </DropdownMenuItem>
                  ) : null}
                  {(showAttachmentTools || showMentionTools) && (onCollaborationModeChange || onGoalModeEnabledChange) ? <DropdownMenuSeparator /> : null}
                  {onCollaborationModeChange ? (
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault()
                        onCollaborationModeChange(collaborationMode === 'plan' ? 'default' : 'plan')
                      }}
                      className="gap-2"
                    >
                      <span className="flex w-4 justify-center">{collaborationMode === 'plan' ? <Check size={14} /> : null}</span>
                      <Sparkles size={14} />
                      <span>计划模式</span>
                    </DropdownMenuItem>
                  ) : null}
                  {onGoalModeEnabledChange ? (
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault()
                        onGoalModeEnabledChange(!goalModeEnabled)
                      }}
                      className="gap-2"
                    >
                      <span className="flex w-4 justify-center">{goalModeEnabled ? <Check size={14} /> : null}</span>
                      <CircleDot size={14} />
                      <span>追求目标</span>
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {showApprovalPresetSelector && !answeringPendingInput ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="ms-control ms-agent-composer__approval-trigger"
                    disabled={loading || buildingSendWorkspace || uploading}
                    aria-label={`Run profile: ${runProfile.label}`}
                    title={`Run profile: ${runProfile.label}`}
                  >
                    <Hand size={15} />
                    <span>{runProfileDisplayLabel}</span>
                    <ChevronDown size={12} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="top" className="min-w-64">
                  <DropdownMenuLabel>Run Profile</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {AGENT_RUN_PROFILE_PRESETS.map((preset) => (
                    <DropdownMenuItem
                      key={preset.id}
                      onSelect={() => handleProfilePresetChange(preset.id)}
                      className="items-start gap-2"
                    >
                      <span className="mt-0.5 flex w-3 justify-center text-muted-foreground">
                        {preset.id === profilePresetId ? <Check size={12} /> : null}
                      </span>
                      <span className="min-w-0">
                        <span className="block type-tiny font-medium text-foreground">{preset.id === 'default' ? '默认权限' : preset.label}</span>
                        <span className="block whitespace-normal type-tiny text-muted-foreground">{preset.description}</span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {(showApprovalPresetSelector && !answeringPendingInput) || collaborationMode === 'plan' || goalModeEnabled ? (
              <span className="ms-agent-composer__toolbar-divider" aria-hidden="true" />
            ) : null}
            {collaborationMode === 'plan' ? (
              <span
                className="ms-control ms-agent-composer__goal-trigger"
                data-active="true"
                aria-label="计划模式已开启"
                title="计划模式已开启"
              >
                <Sparkles size={15} />
                <span>计划</span>
              </span>
            ) : null}
            {goalModeEnabled ? (
              <span
                className="ms-control ms-agent-composer__goal-trigger"
                data-active="true"
                aria-label="目标模式已开启"
                title="目标模式已开启"
              >
                <CircleDot size={15} />
                <span>目标</span>
              </span>
            ) : null}
            {showWorkspaceSelector && workspaceProjectLocked ? (
              <span
                className="ms-agent-composer__workspace-select h-7 max-w-[128px] min-w-0 truncate px-2 type-tiny"
                title={selectedWorkspaceProjectTitle || '选择范围'}
              >
                {selectedWorkspaceProjectLabel || '选择范围'}
              </span>
            ) : showWorkspaceSelector ? (
              <Select
                value={workspaceProjectValue}
                onValueChange={onWorkspaceProjectChange}
                disabled={workspaceSelectorDisabled || workspaceProjectsLoading}
              >
                <SelectTrigger
                  size="sm"
                  className="ms-agent-composer__workspace-select h-7 max-w-[128px] min-w-0 type-tiny"
                  title={selectedWorkspaceProjectTitle || (workspaceProjectsLoading ? '读取项目...' : '选择范围')}
                >
                  <span className="min-w-0 truncate">
                    {workspaceProjectsLoading ? '读取项目...' : selectedWorkspaceProjectLabel || '选择范围'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {workspaceProjectOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">{option.label}</span>
                        {option.meta ? <span className="truncate text-muted-foreground">{option.meta}</span> : null}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {composerAttachmentsCount > 0 && (
              <Badge className="max-w-24 truncate type-tiny">
                {t('agents.chat.attachmentsCount', { count: composerAttachmentsCount })}
              </Badge>
            )}
            {showDebugPreview ? (
              <Button
                type="button"
                size="sm"
                variant={debugBeforeSend ? 'soft' : 'ghost'}
                onClick={() => onDebugBeforeSendChange(!debugBeforeSend)}
                disabled={answeringPendingInput}
                className="ms-agent-composer__debug-action px-2 type-tiny"
                title={t('agents.chat.previewPayload')}
              >
                <Eye size={12} />
                {t('agents.chat.debugPreview')}
              </Button>
            ) : null}
            {canStopActiveRun && (
              <AgentComposerAction
                onClick={onStopActiveRun}
                disabled={stoppingActiveRun}
                aria-label={t('agents.chat.stop')}
                title={t('agents.chat.stop')}
              >
                {stoppingActiveRun ? <Loader2 size={14} className="animate-spin" /> : <CircleStop size={14} />}
              </AgentComposerAction>
            )}
          </div>
          <div className="ms-agent-composer__submit-group">
            <AgentComposerModelSelector
              modelOptions={modelOptions}
              modelValue={modelValue}
              onModelChange={onModelChange}
              disabled={loading || buildingSendWorkspace || answeringPendingInput}
            />
            <button
              type="button"
              className="ms-control ms-agent-composer__voice-action"
              disabled
              aria-label="语音输入"
              title="语音输入"
            >
              <Mic size={15} />
            </button>
            <AgentComposerSubmit
              type="submit"
              running={loading || buildingSendWorkspace}
              disabled={!canSubmit}
              label={answeringPendingInput ? '回答' : debugBeforeSend ? t('agents.chat.preview') : t('common.send')}
            >
              {stoppingActiveRun
                ? <Loader2 size={14} className="animate-spin" />
                : buildingSendWorkspace
                  ? <Loader2 size={14} className="animate-spin" />
                  : debugBeforeSend && !loading ? <Eye size={14} /> : <Send size={14} />}
            </AgentComposerSubmit>
          </div>
        </AgentComposerToolbar>
      </AgentComposer>
      </section>
    </AgentSurfaceBlock>
  )
}
