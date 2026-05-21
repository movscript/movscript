import type { ComponentProps, DragEventHandler, FormEvent, RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { AtSign, CircleStop, Eye, Loader2, Send, Upload } from 'lucide-react'
import {
  AgentComposer,
  AgentComposerAction,
  AgentComposerSubmit,
  AgentComposerToolbar,
  Badge,
  Button,
} from '@movscript/ui'
import { attachmentKey } from '@/lib/agentAttachments'
import { RESOURCE_UPLOAD_ACCEPT } from '@/lib/mediaTypes'
import { cn } from '@/lib/utils'
import {
  AgentMentionEditor,
  ComposerAttachmentChip,
  MentionResourceOption,
} from '@/components/agent/AgentMentionEditor'
import type { AgentAttachment } from '@/store/agentStore'

type MentionStateHandler = ComponentProps<typeof AgentMentionEditor>['onMentionState']

export interface AgentComposerSectionProps {
  answeringPendingInput: boolean
  activePendingInputTitle?: string
  addMentionTrigger: () => void
  buildingSendDraft: boolean
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
  stoppingLocalRun: boolean
  uploading: boolean
  onAcceptMention: () => boolean
  onComposerDragEnter: DragEventHandler
  onComposerDragLeave: DragEventHandler
  onComposerDragOver: DragEventHandler
  onComposerDrop: DragEventHandler
  onDebugBeforeSendChange: (next: boolean) => void
  onInputChange: (value: string) => void
  onMentionEscape: () => void
  onMentionSelect: (attachment: AgentAttachment) => void
  onMentionState: MentionStateHandler
  onRemoveAttachment: (attachmentId: string) => void
  onSend: () => void
  onStopLocalRun: () => void
  onUploadFiles: (files: FileList) => void
}

export function AgentComposerSection({
  answeringPendingInput,
  activePendingInputTitle,
  addMentionTrigger,
  buildingSendDraft,
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
  stoppingLocalRun,
  uploading,
  onAcceptMention,
  onComposerDragEnter,
  onComposerDragLeave,
  onComposerDragOver,
  onComposerDrop,
  onDebugBeforeSendChange,
  onInputChange,
  onMentionEscape,
  onMentionSelect,
  onMentionState,
  onRemoveAttachment,
  onSend,
  onStopLocalRun,
  onUploadFiles,
}: AgentComposerSectionProps) {
  const { t } = useTranslation()
  const editorDisabled = buildingSendDraft || (answeringPendingInput && !canAnswerPendingInputWithText)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSend()
  }

  return (
    <section className="ai-agent-panel-card ai-agent-panel-input-card">
      <div className="ai-agent-panel-card-header ai-agent-panel-input-header">
        <p className="ai-agent-panel-card-title">{answeringPendingInput ? '回答请求' : '输入'}</p>
        <p className="min-w-0 truncate text-right type-tiny text-muted-foreground/40">
          {activePendingInputTitle ?? t('agents.chat.inputHint')}
        </p>
      </div>
      <AgentComposer
        className={cn('ai-agent-panel-composer', draggingFiles && 'ai-agent-panel-composer--dragging')}
        onDragEnter={onComposerDragEnter}
        onDragOver={onComposerDragOver}
        onDragLeave={onComposerDragLeave}
        onDrop={onComposerDrop}
        onSubmit={handleSubmit}
      >
        <input
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
          />
          {draggingFiles && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-md border border-dashed border-primary/40 bg-primary/8 type-caption text-primary">
              {t('agents.chat.dropFilesHere')}
            </div>
          )}
          {mentionRangeActive && mentionResults.length > 0 && (
            <div className="absolute bottom-full left-0 z-30 mb-1.5 w-full overflow-hidden rounded-md border border-border bg-background shadow-lg">
              <div className="border-b border-border px-2 py-1 type-tiny text-muted-foreground">
                {t('shared.genInput.mention')}
              </div>
              <div className="max-h-48 overflow-auto">
                {mentionResults.map((attachment) => (
                  <MentionResourceOption
                    key={attachmentKey(attachment)}
                    attachment={attachment}
                    onSelect={() => onMentionSelect(attachment)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
        <AgentComposerToolbar>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            <AgentComposerAction
              onClick={() => fileRef.current?.click()}
              disabled={answeringPendingInput || uploading || loading || buildingSendDraft}
              aria-label={t('agents.chat.uploadAttachment')}
              title={t('agents.chat.uploadAttachment')}
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            </AgentComposerAction>
            <AgentComposerAction
              onClick={addMentionTrigger}
              disabled={answeringPendingInput || buildingSendDraft}
              aria-label={t('shared.genInput.mention')}
              title={t('shared.genInput.mention')}
            >
              <AtSign size={13} />
            </AgentComposerAction>
            {composerAttachmentsCount > 0 && (
              <Badge variant="secondary" className="max-w-24 truncate type-tiny">
                {t('agents.chat.attachmentsCount', { count: composerAttachmentsCount })}
              </Badge>
            )}
            <Button
              type="button"
              size="sm"
              variant={debugBeforeSend ? 'secondary' : 'ghost'}
              onClick={() => onDebugBeforeSendChange(!debugBeforeSend)}
              disabled={answeringPendingInput}
              className="px-2 type-tiny"
              title={t('agents.chat.previewPayload')}
            >
              <Eye size={11} />
              {t('agents.chat.debugPreview')}
            </Button>
            {canStopLocalRun && (
              <AgentComposerAction
                onClick={onStopLocalRun}
                disabled={stoppingLocalRun}
                aria-label={t('agents.chat.stop')}
                title={t('agents.chat.stop')}
              >
                {stoppingLocalRun ? <Loader2 size={13} className="animate-spin" /> : <CircleStop size={13} />}
              </AgentComposerAction>
            )}
          </div>
          <AgentComposerSubmit
            type="submit"
            running={loading || buildingSendDraft}
            disabled={!canSend}
            label={answeringPendingInput ? '回答' : loading ? '补充' : debugBeforeSend ? t('agents.chat.preview') : t('common.send')}
          >
            {stoppingLocalRun
              ? <Loader2 size={15} className="animate-spin" />
              : buildingSendDraft
                ? <Loader2 size={15} className="animate-spin" />
                : debugBeforeSend && !loading ? <Eye size={15} /> : <Send size={15} />}
          </AgentComposerSubmit>
        </AgentComposerToolbar>
      </AgentComposer>
    </section>
  )
}
