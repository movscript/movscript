import type { ClipboardEventHandler, ComponentProps, DragEventHandler, FormEvent, RefObject } from 'react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { AtSign, Check, ChevronDown, ChevronUp, CircleDot, CircleStop, CornerDownLeft, Eye, Hand, Loader2, Mic, Paperclip, Pencil, Plus, Send, Sparkles, Trash2 } from 'lucide-react'
import {
  AgentComposer,
  AgentComposerAction,
  AgentComposerDropOverlay,
  AgentComposerSubmit,
  AgentComposerToolbar,
  AgentSurfaceBlock,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
  SelectTrigger,
  IdentityMark,
} from '@movscript/ui'
import { attachmentKey } from '@/features/agent/domain/agentAttachments'
import { RESOURCE_UPLOAD_ACCEPT } from '@/shared/domain/mediaTypes'
import { cn } from '@/shared/ui/cn'
import {
  AgentMentionEditor,
  ComposerAttachmentChip,
  MentionResourceOption,
} from '@/features/agent/components/AgentMentionEditor'
import {
  agentComposerMentionMenuPositionEqual,
  agentComposerMentionMenuPositionFromEditorElement,
  agentComposerMentionMenuStyleFromPosition,
  subscribeAgentComposerMentionMenuPlacement,
  type AgentComposerMentionMenuPosition,
} from '@/features/agent/presentation/agentComposerMentionMenuPlacement'
import type { AgentPendingActiveRunInputQueueItem } from '@movscript/core/agent/protocol'
import {
  agentChatQueuedInputSummary,
  agentThreadGoalStatusLabel,
  type AgentChatQueuedInputPreviewItem,
  type AgentChatQueuedInputStatus,
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
  const showWorkspaceSelector = workspaceProjectOptions.length > 0
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
  const showModelSelector = modelOptions.length > 0 && modelValue !== undefined && !!onModelChange
  const selectedModel = showModelSelector
    ? modelOptions.find((model) => model.id === modelValue) ?? modelOptions[0]
    : undefined
  const selectedModelId = selectedModel ? agentComposerModelId(selectedModel) : undefined
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

  const uploadingFileCount = uploadingFileNames.length
  const uploadingPrimaryFileName = uploadingFileNames[0]
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
        <Dialog open={uploading}>
          <DialogContent
            hideClose
            className="w-[min(360px,calc(100vw-32px))]"
            onEscapeKeyDown={(event) => event.preventDefault()}
            onPointerDownOutside={(event) => event.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>{t('agents.chat.uploadDialogTitle')}</DialogTitle>
              <DialogDescription>
                {t('agents.chat.uploadDialogDescription', {
                  count: uploadingFileCount,
                  uploaded: uploadedFileCount,
                })}
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-3 rounded-md border border-border bg-muted px-3 py-2">
              <Loader2 size={16} className="shrink-0 animate-spin text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate type-caption text-foreground">
                  {uploadingPrimaryFileName ?? t('agents.chat.uploadDialogPreparing')}
                </p>
                <p className="type-tiny text-muted-foreground">
                  {t('agents.chat.uploadDialogProgress', {
                    uploaded: uploadedFileCount,
                    count: uploadingFileCount,
                  })}
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      <AgentQueuedInputPreview
        goal={goalState}
        items={queuedInputs}
        legacyItems={pendingActiveRunInputQueue}
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
            {showModelSelector ? (
              <Select
                value={modelValue === null ? 'auto' : String(modelValue)}
                onValueChange={(value) => onModelChange(value === 'auto' ? null : Number(value))}
                disabled={loading || buildingSendWorkspace || answeringPendingInput}
              >
                <SelectTrigger size="sm" className="ai-agent-model-select h-7 max-w-[180px] min-w-0 type-tiny">
                  <span className="ai-agent-model-select__value">
                    <span className="ai-agent-model-select__id">{selectedModelId ?? 'Auto model'}</span>
                  </span>
                </SelectTrigger>
                <SelectContent align="end" className="min-w-64">
                  <SelectItem value="auto">
                    <span className="ai-agent-model-select__option">
                      {selectedModelId ? <IdentityMark kind="model" id={selectedModelId} /> : null}
                      <span className="ai-agent-model-select__option-copy">
                        <span className="ai-agent-model-select__id">Auto model</span>
                        <span className="ai-agent-model-select__meta">{selectedModelId ?? 'backend default'}</span>
                      </span>
                    </span>
                  </SelectItem>
                  {modelOptions.map((model) => (
                    <SelectItem key={model.id} value={String(model.id)}>
                      <span className="ai-agent-model-select__option">
                        <IdentityMark kind="model" id={agentComposerModelId(model)} />
                        <span className="ai-agent-model-select__option-copy">
                          <span className="ai-agent-model-select__id">{agentComposerModelId(model)}</span>
                          {model.provider_name ? <span className="ai-agent-model-select__meta">{model.provider_name}</span> : null}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
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

function AgentQueuedInputPreview({
  goal,
  items,
  legacyItems,
  collapsed,
  steerEnabled,
  onCollapsedChange,
  onDelete,
  onEdit,
  onEditCancel,
  onSteerNow,
  onTextChange,
}: {
  goal: AgentThreadGoalState | null
  items: AgentChatQueuedInputPreviewItem[]
  legacyItems: AgentPendingActiveRunInputQueueItem[]
  collapsed: boolean
  steerEnabled: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  onDelete?: (id: string) => void
  onEdit?: (id: string) => void
  onEditCancel?: (id: string) => void
  onSteerNow?: (id: string) => void
  onTextChange?: (id: string, text: string) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const previewItems = items.length > 0
    ? items
    : legacyItems.map((item, index): AgentChatQueuedInputPreviewItem => ({
        id: item.id,
        text: item.content,
        inputs: [],
        status: 'draft' as AgentChatQueuedInputStatus,
        createdAt: index,
      }))
  const editingItem = editingId ? previewItems.find((item) => item.id === editingId) : undefined
  useEffect(() => {
    if (!editingId || editingItem) return
    setEditingId(null)
    setEditingText('')
  }, [editingId, editingItem])

  if (previewItems.length === 0 && !goal) return null

  function startEditing(item: AgentChatQueuedInputPreviewItem) {
    if (item.status === 'sending') return
    setEditingId(item.id)
    setEditingText(item.text)
    onEdit?.(item.id)
  }

  function commitEditing(item: AgentChatQueuedInputPreviewItem) {
    if (editingId !== item.id) return
    setEditingId(null)
    onTextChange?.(item.id, editingText)
  }

  function cancelEditing(item: AgentChatQueuedInputPreviewItem) {
    if (editingId !== item.id) return
    setEditingId(null)
    setEditingText(item.text)
    onEditCancel?.(item.id)
  }

  const isCollapsed = collapsed && previewItems.length > 1
  const visibleItems = isCollapsed ? previewItems.slice(0, 1) : previewItems
  return (
    <div className="mb-2 flex justify-center">
      <div className="w-[calc(100%-32px)] max-w-[680px] space-y-1.5">
        {goal ? <AgentGoalStatusPill goal={goal} /> : null}
        {previewItems.length > 0 ? (
          <div className="rounded-md border border-border bg-muted/45 px-2.5 py-2 shadow-sm">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 text-left type-tiny text-muted-foreground"
              onClick={() => onCollapsedChange?.(!collapsed)}
              aria-expanded={!isCollapsed}
            >
              <span className="inline-flex min-w-0 items-center gap-1.5">
                {previewItems.some((item) => item.status === 'sending')
                  ? <Loader2 size={10} className="shrink-0 animate-spin" />
                  : <CornerDownLeft size={11} className="shrink-0" />}
                <span className="truncate">等待进入会话</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5">
                <span>{previewItems.length}</span>
                {isCollapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
              </span>
            </button>
            <div className="mt-1.5 space-y-1">
              {visibleItems.map((item) => (
                <div
                  key={item.id}
                  className="flex min-h-8 items-center gap-2 border-t border-border/70 pt-1 first:border-t-0 first:pt-0"
                >
                  <div className="min-w-0 flex-1">
                    {editingId === item.id ? (
                      <input
                        autoFocus
                        className="h-7 w-full rounded-sm border border-border bg-background px-2 type-tiny text-foreground outline-none focus:border-primary"
                        value={editingText}
                        aria-label="编辑等待消息内容"
                        onChange={(event) => setEditingText(event.currentTarget.value)}
                        onBlur={() => commitEditing(item)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            commitEditing(item)
                          }
                          if (event.key === 'Escape') {
                            event.preventDefault()
                            cancelEditing(item)
                          }
                        }}
                      />
                    ) : (
                      <div className="truncate type-tiny text-foreground" title={agentChatQueuedInputSummary(item)}>
                        {agentChatQueuedInputSummary(item)}
                      </div>
                    )}
                    {item.error ? (
                      <div className="truncate type-tiny text-destructive" title={item.error}>{item.error}</div>
                    ) : null}
                  </div>
                  {item.status === 'sending' ? (
                    <Loader2 size={13} className="shrink-0 animate-spin text-muted-foreground" />
                  ) : (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        className="ms-control h-6 w-6 justify-center p-0"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => editingId === item.id ? commitEditing(item) : startEditing(item)}
                        aria-label={editingId === item.id ? '保存等待消息' : '编辑等待消息'}
                        title={editingId === item.id ? '保存等待消息' : '编辑等待消息'}
                      >
                        {editingId === item.id ? <Check size={12} /> : <Pencil size={12} />}
                      </button>
                      <button
                        type="button"
                        className="ms-control h-6 w-6 justify-center p-0"
                        disabled={editingId === item.id || !steerEnabled}
                        onClick={() => onSteerNow?.(item.id)}
                        aria-label="立即插队"
                        title={steerEnabled ? '立即插队' : '当前后端不支持运行中插队'}
                      >
                        <CornerDownLeft size={12} />
                      </button>
                      <button
                        type="button"
                        className="ms-control h-6 w-6 justify-center p-0"
                        disabled={editingId === item.id}
                        onClick={() => onDelete?.(item.id)}
                        aria-label="删除等待消息"
                        title="删除等待消息"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function AgentGoalStatusPill({ goal }: { goal: AgentThreadGoalState }) {
  const usage = goal.tokenBudget && goal.tokensUsed !== undefined
    ? `${goal.tokensUsed}/${goal.tokenBudget}`
    : goal.tokensUsed !== undefined
      ? `${goal.tokensUsed} tokens`
      : undefined
  return (
    <div className="flex min-h-8 items-center gap-2 rounded-md border border-border bg-background/80 px-2.5 py-1.5 shadow-sm">
      <CircleDot size={12} className="shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="truncate type-tiny font-medium text-foreground" title={goal.objective}>
          {goal.objective}
        </div>
      </div>
      <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 type-tiny text-muted-foreground">
        {agentThreadGoalStatusLabel(goal.status)}
      </span>
      {usage ? (
        <span className="hidden shrink-0 type-tiny text-muted-foreground sm:inline">
          {usage}
        </span>
      ) : null}
    </div>
  )
}

function agentComposerModelId(model: PublicModel): string {
  return model.model_id?.trim() || model.logical_model_id?.trim() || model.model_def_id?.trim() || `model_config:${model.id}`
}
