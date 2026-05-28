import React from 'react'
import { X } from 'lucide-react'
import { AgentMediaThumb, Button } from '@movscript/ui'
import { attachmentDisplayUrl, formatAgentAttachmentBytes } from '@/features/agent/domain/agentAttachments'
import { mentionEditorTextBeforeCaret, serializeMentionEditor } from '@/features/agent/presentation/agentMentionEditorModel'
import { AuthedImage, AuthedVideo } from '@/shared/ui/AuthedImage'
import {
  AgentAttachmentIcon as AttachmentIcon,
} from '@/features/agent/components/AgentMessageContent'
import { cn } from '@/shared/ui/cn'
import type { AgentAttachment } from '@/features/agent/state/agentStore'

function isImeComposing(event: React.KeyboardEvent): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229
}

export function ComposerAttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: AgentAttachment
  onRemove: () => void
}) {
  const url = attachmentDisplayUrl(attachment)
  const preview = attachment.type === 'image' && url ? (
    <AuthedImage src={url} alt={attachment.name} />
  ) : attachment.type === 'video' && url ? (
    <AuthedVideo src={url} muted playsInline preload="metadata" />
  ) : (
    <span className="ms-center text-muted-foreground">
      <AttachmentIcon type={attachment.type} size={10} />
    </span>
  )

  return (
    <div className="flex min-w-0 items-center gap-2 border-t border-border px-0 py-1 type-caption first:border-t-0">
      <AgentMediaThumb size="md">
        {preview}
      </AgentMediaThumb>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate text-foreground">{attachment.name}</span>
        </div>
        <p className="truncate type-tiny text-muted-foreground">{formatAgentAttachmentBytes(attachment.size)}</p>
      </div>
      <Button type="button" variant="ghost" tone="danger" size="icon-xs" className="shrink-0" onClick={onRemove} aria-label={`Remove ${attachment.name}`}>
        <X size={10} />
      </Button>
    </div>
  )
}

export function MentionResourceOption({ attachment, onSelect }: { attachment: AgentAttachment; onSelect: () => void }) {
  const url = attachmentDisplayUrl(attachment)
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onMouseDown={(e) => {
        e.preventDefault()
        onSelect()
      }}
      className="w-full justify-start gap-2 rounded-none px-2 py-1.5 text-left type-caption"
    >
      <AgentMediaThumb size="md">
        {attachment.type === 'image' && url ? (
          <AuthedImage src={url} alt={attachment.name} />
        ) : attachment.type === 'video' && url ? (
          <AuthedVideo src={url} muted playsInline preload="metadata" />
        ) : (
          <span className="ms-center text-muted-foreground">
            <AttachmentIcon type={attachment.type} size={10} />
          </span>
        )}
      </AgentMediaThumb>
      <span className="min-w-0 flex-1 truncate text-foreground">{attachment.name}</span>
      <span className="shrink-0 type-tiny text-muted-foreground">
        {attachment.resourceId ? `#${attachment.resourceId}` : ''}
      </span>
    </Button>
  )
}

export function AgentMentionEditor({
  editorRef,
  disabled,
  placeholder,
  onChange,
  onMentionState,
  onSubmit,
  onEscape,
  onAcceptMention,
}: {
  editorRef: React.RefObject<HTMLDivElement>
  disabled?: boolean
  placeholder: string
  onChange: (value: string) => void
  onMentionState: (value: string, caret: number) => void
  onSubmit: () => void
  onEscape: () => void
  onAcceptMention: () => boolean
}) {
  function syncFromEditor() {
    const editor = editorRef.current
    if (!editor) return
    const next = serializeMentionEditor(editor)
    onChange(next)
    const { text, caret } = mentionEditorTextBeforeCaret(editor)
    onMentionState(text, caret)
  }

  return (
    <div
      ref={editorRef}
      role="textbox"
      aria-multiline="true"
      contentEditable={!disabled}
      suppressContentEditableWarning
      data-placeholder={placeholder}
      className={cn('ai-agent-panel-mention-editor', disabled && 'ai-agent-panel-mention-editor--disabled')}
      onInput={syncFromEditor}
      onClick={syncFromEditor}
      onKeyUp={(event) => {
        if (event.key === 'Escape') return
        syncFromEditor()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onEscape()
          return
        }
        if (isImeComposing(event)) return
        if ((event.key === 'Enter' || event.key === 'Tab') && onAcceptMention()) {
          event.preventDefault()
          return
        }
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          onSubmit()
        }
      }}
      onPaste={(event) => {
        event.preventDefault()
        const text = event.clipboardData.getData('text/plain')
        document.execCommand('insertText', false, text)
      }}
    />
  )
}
