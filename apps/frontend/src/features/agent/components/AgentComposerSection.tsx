import type { ClipboardEventHandler, ComponentProps, CSSProperties, DragEventHandler, FormEvent, RefObject } from 'react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { AtSign, Check, ChevronDown, CircleDot, CircleStop, Eye, FolderTree, Loader2, Paperclip, Plus, Send, Sparkles } from 'lucide-react'
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
  SelectValue,
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
import { ProviderMark } from '@/features/agent/components/ProviderControls'
import type { AgentPendingActiveRunInputQueueItem } from '@/features/agent/domain/agentActiveRunInputMessages'
import {
  AGENT_RUN_PROFILE_PRESETS,
  DEFAULT_AGENT_RUN_PROFILE_PRESET_ID,
  agentRunProfilePresetById,
  type AgentRunProfilePresetId,
} from '@/features/agent/domain/agentRunProfilePreset'
import type { AgentAttachment } from '@/features/agent/state/agentStore'
import type { PublicModel } from '@/types'

type MentionStateHandler = ComponentProps<typeof AgentMentionEditor>['onMentionState']

interface MentionMenuPosition {
  bottom: number
  left: number
  maxHeight: number
  width: number
}

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
  modelOptions?: PublicModel[]
  modelValue?: number | null
  pendingActiveRunInputQueue: AgentPendingActiveRunInputQueueItem[]
  stoppingActiveRun: boolean
  uploading: boolean
  uploadedFileCount: number
  uploadingFileNames: string[]
  workspaceProjectOptions?: WorkspaceContextOption[]
  workspaceProjectValue?: string
  workspaceProjectsLoading?: boolean
  workspaceProductionOptions?: WorkspaceContextOption[]
  workspaceProductionValue?: string
  workspaceProductionsLoading?: boolean
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
  onRemoveAttachment: (attachmentId: string) => void
  onSend: (profilePresetId?: AgentRunProfilePresetId) => void
  onStopActiveRun: () => void
  onUploadFiles: (files: FileList) => void
  onWorkspaceProjectChange?: (value: string) => void
  onWorkspaceProductionChange?: (value: string) => void
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
  modelOptions = [],
  modelValue,
  pendingActiveRunInputQueue,
  stoppingActiveRun,
  uploading,
  uploadedFileCount,
  uploadingFileNames,
  workspaceProjectOptions = [],
  workspaceProjectValue,
  workspaceProjectsLoading = false,
  workspaceProductionOptions = [],
  workspaceProductionValue,
  workspaceProductionsLoading = false,
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
  onRemoveAttachment,
  onSend,
  onStopActiveRun,
  onUploadFiles,
  onWorkspaceProjectChange,
  onWorkspaceProductionChange,
  showApprovalPresetSelector = true,
  showAttachmentTools = true,
  showDebugPreview = true,
  showMentionTools = true,
}: AgentComposerSectionProps) {
  const { t } = useTranslation()
  const editorDisabled = buildingSendWorkspace || (answeringPendingInput && !canAnswerPendingInputWithText)
  const [mentionMenuPosition, setMentionMenuPosition] = useState<MentionMenuPosition | null>(null)
  const [profilePresetId, setProfilePresetId] = useState<AgentRunProfilePresetId>(DEFAULT_AGENT_RUN_PROFILE_PRESET_ID)
  const runProfile = agentRunProfilePresetById(profilePresetId)
  const mentionMenuOpen = mentionRangeActive && mentionResults.length > 0
  const actionMenuDisabled = answeringPendingInput || uploading || loading || buildingSendWorkspace

  useEffect(() => {
    if (!mentionMenuOpen) {
      setMentionMenuPosition((current) => current === null ? current : null)
      return
    }

    function updateMentionMenuPosition() {
      const editor = inputRef.current
      if (!editor) return
      const rect = editor.getBoundingClientRect()
      const viewportPadding = 8
      const gap = 6
      const availableAbove = Math.max(120, rect.top - viewportPadding - gap)
      const width = Math.min(Math.max(rect.width, 360), window.innerWidth - viewportPadding * 2)
      const left = Math.min(Math.max(rect.left, viewportPadding), window.innerWidth - width - viewportPadding)

      const nextPosition = {
        bottom: Math.max(viewportPadding, window.innerHeight - rect.top + gap),
        left,
        maxHeight: Math.min(360, availableAbove),
        width,
      }

      setMentionMenuPosition((current) => (
        current
          && current.bottom === nextPosition.bottom
          && current.left === nextPosition.left
          && current.maxHeight === nextPosition.maxHeight
          && current.width === nextPosition.width
          ? current
          : nextPosition
      ))
    }

    updateMentionMenuPosition()
    window.addEventListener('resize', updateMentionMenuPosition)
    window.addEventListener('scroll', updateMentionMenuPosition, true)

    return () => {
      window.removeEventListener('resize', updateMentionMenuPosition)
      window.removeEventListener('scroll', updateMentionMenuPosition, true)
    }
  }, [inputRef, mentionMenuOpen])

  const mentionMenuPortalTarget = typeof document === 'undefined' ? null : document.body
  const workspaceSelectorDisabled = answeringPendingInput || buildingSendWorkspace || loading
  const showWorkspaceSelector = workspaceProjectOptions.length > 0
    && workspaceProjectValue !== undefined
    && !!onWorkspaceProjectChange
  const showProductionSelector = workspaceProductionOptions.length > 0
    && workspaceProductionValue !== undefined
    && !!onWorkspaceProductionChange
  const showModelSelector = modelOptions.length > 0 && modelValue !== undefined && !!onModelChange
  const selectedModel = showModelSelector
    ? modelOptions.find((model) => model.id === modelValue) ?? modelOptions[0]
    : undefined
  const selectedModelId = selectedModel ? agentComposerModelId(selectedModel) : undefined
  const mentionMenu = mentionMenuOpen && mentionMenuPosition && mentionMenuPortalTarget ? createPortal(
    <div
      className="ai-agent-resource-mention-menu overflow-hidden border border-border bg-background shadow-lg"
      style={{
        '--ai-agent-resource-mention-menu-max-height': `${mentionMenuPosition.maxHeight}px`,
        bottom: mentionMenuPosition.bottom,
        left: mentionMenuPosition.left,
        width: mentionMenuPosition.width,
      } as CSSProperties}
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

  const uploadingFileCount = uploadingFileNames.length
  const uploadingPrimaryFileName = uploadingFileNames[0]

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
      {pendingActiveRunInputQueue.length > 0 && (
        <div className="mb-2 space-y-1.5 px-2 py-1.5">
          <div className="flex items-center justify-between gap-2 type-tiny text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Loader2 size={10} className="animate-spin" />
              等待加入运行
            </span>
            <span>{pendingActiveRunInputQueue.length}</span>
          </div>
          <div className="space-y-1">
            {pendingActiveRunInputQueue.map((item) => (
              <div
                key={item.id}
                className="truncate border-t border-border px-0 py-1 type-tiny text-foreground first:border-t-0"
                title={item.content}
              >
                {item.content || '空消息'}
              </div>
            ))}
          </div>
        </div>
      )}
      <AgentComposer
        className={cn('ai-agent-panel-composer', draggingFiles && 'ai-agent-panel-composer--dragging')}
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
            onChange={onInputChange}
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
        {showWorkspaceSelector ? (
          <div className="ms-agent-composer__workspace-row">
            <span className="ms-agent-composer__workspace-label">
              <FolderTree size={12} />
              工作目录
            </span>
            <Select
              value={workspaceProjectValue}
              onValueChange={onWorkspaceProjectChange}
              disabled={workspaceSelectorDisabled || workspaceProjectsLoading}
            >
              <SelectTrigger size="sm" className="ms-agent-composer__workspace-select h-7 w-[min(210px,100%)] min-w-0 type-tiny">
                <SelectValue placeholder={workspaceProjectsLoading ? '读取项目...' : '选择项目'} />
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
            {showProductionSelector ? (
              <Select
                value={workspaceProductionValue}
                onValueChange={onWorkspaceProductionChange}
                disabled={workspaceSelectorDisabled || workspaceProductionsLoading}
              >
                <SelectTrigger size="sm" className="ms-agent-composer__workspace-select h-7 w-[min(210px,100%)] min-w-0 type-tiny">
                  <SelectValue placeholder={workspaceProductionsLoading ? '读取制作...' : '选择制作'} />
                </SelectTrigger>
                <SelectContent>
                  {workspaceProductionOptions.map((option) => (
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
          </div>
        ) : null}
        <AgentComposerToolbar>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            <ProviderMark />
            {showModelSelector ? (
              <Select
                value={modelValue === null ? 'auto' : String(modelValue)}
                onValueChange={(value) => onModelChange(value === 'auto' ? null : Number(value))}
                disabled={loading || buildingSendWorkspace || answeringPendingInput}
              >
                <SelectTrigger size="sm" className="ai-agent-model-select h-7 max-w-[180px] min-w-0 type-tiny">
                  <span className="ai-agent-model-select__value">
                    {selectedModelId ? <IdentityMark kind="model" id={selectedModelId} /> : null}
                    <span className="ai-agent-model-select__id">{selectedModelId ?? 'Auto model'}</span>
                  </span>
                </SelectTrigger>
                <SelectContent align="start" className="min-w-64">
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
                className="px-2 type-tiny"
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
                    <span>{runProfile.shortLabel}</span>
                    <ChevronDown size={12} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-64">
                  <DropdownMenuLabel>Run Profile</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {AGENT_RUN_PROFILE_PRESETS.map((preset) => (
                    <DropdownMenuItem
                      key={preset.id}
                      onSelect={() => setProfilePresetId(preset.id)}
                      className="items-start gap-2"
                    >
                      <span className="mt-0.5 flex w-3 justify-center text-muted-foreground">
                        {preset.id === profilePresetId ? <Check size={12} /> : null}
                      </span>
                      <span className="min-w-0">
                        <span className="block type-tiny font-medium text-foreground">{preset.label}</span>
                        <span className="block whitespace-normal type-tiny text-muted-foreground">{preset.description}</span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <AgentComposerSubmit
              type="submit"
              running={loading || buildingSendWorkspace}
              disabled={!canSend}
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

function agentComposerModelId(model: PublicModel): string {
  return model.model_id?.trim() || model.logical_model_id?.trim() || model.model_def_id?.trim() || `model_config:${model.id}`
}
