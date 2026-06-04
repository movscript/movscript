import type { ClipboardEventHandler, ComponentProps, CSSProperties, DragEventHandler, FormEvent, RefObject } from 'react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { AtSign, CircleStop, Eye, Loader2, Send, Upload } from 'lucide-react'
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
  Input,
} from '@movscript/ui'
import { attachmentKey } from '@/features/agent/domain/agentAttachments'
import { RESOURCE_UPLOAD_ACCEPT } from '@/shared/domain/mediaTypes'
import { cn } from '@/shared/ui/cn'
import {
  AgentMentionEditor,
  ComposerAttachmentChip,
  MentionResourceOption,
} from '@/features/agent/components/AgentMentionEditor'
import type { AgentPendingRuntimeInputQueueItem } from '@/features/agent/domain/agentRuntimeInputMessages'
import type { AgentAttachment } from '@/features/agent/state/agentStore'

type MentionStateHandler = ComponentProps<typeof AgentMentionEditor>['onMentionState']

interface MentionMenuPosition {
  bottom: number
  left: number
  maxHeight: number
  width: number
}

export interface AgentComposerSectionProps {
  chrome?: 'card' | 'bottom-bar' | 'flush'
  answeringPendingInput: boolean
  activePendingInputTitle?: string
  addMentionTrigger: () => void
  buildingSendWorkspace: boolean
  canAnswerPendingInputWithText: boolean
  canSend: boolean
  canStopLocalRun: boolean
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
  pendingRuntimeInputQueue: AgentPendingRuntimeInputQueueItem[]
  stoppingLocalRun: boolean
  uploading: boolean
  uploadedFileCount: number
  uploadingFileNames: string[]
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
  onRemoveAttachment: (attachmentId: string) => void
  onSend: () => void
  onStopLocalRun: () => void
  onUploadFiles: (files: FileList) => void
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
  canStopLocalRun,
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
  pendingRuntimeInputQueue,
  stoppingLocalRun,
  uploading,
  uploadedFileCount,
  uploadingFileNames,
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
  onRemoveAttachment,
  onSend,
  onStopLocalRun,
  onUploadFiles,
  showAttachmentTools = true,
  showDebugPreview = true,
  showMentionTools = true,
}: AgentComposerSectionProps) {
  const { t } = useTranslation()
  const editorDisabled = buildingSendWorkspace || (answeringPendingInput && !canAnswerPendingInputWithText)
  const [mentionMenuPosition, setMentionMenuPosition] = useState<MentionMenuPosition | null>(null)
  const mentionMenuOpen = mentionRangeActive && mentionResults.length > 0

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
    onSend()
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
      {pendingRuntimeInputQueue.length > 0 && (
        <div className="mb-2 space-y-1.5 px-2 py-1.5">
          <div className="flex items-center justify-between gap-2 type-tiny text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Loader2 size={10} className="animate-spin" />
              等待加入运行
            </span>
            <span>{pendingRuntimeInputQueue.length}</span>
          </div>
          <div className="space-y-1">
            {pendingRuntimeInputQueue.map((item) => (
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
            onSubmit={onSend}
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
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {showAttachmentTools ? (
              <AgentComposerAction
                onClick={() => fileRef.current?.click()}
                disabled={answeringPendingInput || uploading || loading || buildingSendWorkspace}
                aria-label={t('agents.chat.uploadAttachment')}
                title={t('agents.chat.uploadAttachment')}
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              </AgentComposerAction>
            ) : null}
            {showMentionTools ? (
              <AgentComposerAction
                onClick={addMentionTrigger}
                disabled={answeringPendingInput || buildingSendWorkspace}
                aria-label={t('shared.genInput.mention')}
                title={t('shared.genInput.mention')}
              >
                <AtSign size={14} />
              </AgentComposerAction>
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
            {canStopLocalRun && (
              <AgentComposerAction
                onClick={onStopLocalRun}
                disabled={stoppingLocalRun}
                aria-label={t('agents.chat.stop')}
                title={t('agents.chat.stop')}
              >
                {stoppingLocalRun ? <Loader2 size={14} className="animate-spin" /> : <CircleStop size={14} />}
              </AgentComposerAction>
            )}
          </div>
          <AgentComposerSubmit
            type="submit"
            running={loading || buildingSendWorkspace}
            disabled={!canSend}
            label={answeringPendingInput ? '回答' : debugBeforeSend ? t('agents.chat.preview') : t('common.send')}
          >
            {stoppingLocalRun
              ? <Loader2 size={14} className="animate-spin" />
              : buildingSendWorkspace
                ? <Loader2 size={14} className="animate-spin" />
                : debugBeforeSend && !loading ? <Eye size={14} /> : <Send size={14} />}
          </AgentComposerSubmit>
        </AgentComposerToolbar>
      </AgentComposer>
      </section>
    </AgentSurfaceBlock>
  )
}
