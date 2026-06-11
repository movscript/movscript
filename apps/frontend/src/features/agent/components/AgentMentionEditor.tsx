import React from 'react'
import { X } from 'lucide-react'
import { AgentMediaThumb, Button } from '@movscript/ui'
import { formatAgentAttachmentBytes } from '@/features/agent/domain/agentAttachments'
import { readMentionEditorState } from '@/features/agent/presentation/agentMentionEditorModel'
import { AgentAttachmentMediaPreview } from '@/features/agent/components/AgentAttachmentMediaPreview'
import { cn } from '@/shared/ui/cn'
import type { AgentAttachment } from '@/features/agent/state/agentStore'
import { performanceNow, recordAgentPerformanceMetric } from '@/features/agent/state/agentPerformanceStore'

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
  return (
    <div className="flex min-w-0 items-center gap-2 border-t border-border px-0 py-1 type-caption first:border-t-0">
      <AgentMediaThumb size="md">
        <AgentAttachmentMediaPreview attachment={attachment} variant="chip" />
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
        <AgentAttachmentMediaPreview attachment={attachment} variant="chip" />
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
  value,
  onChange,
  onMentionState,
  onSubmit,
  onEscape,
  onAcceptMention,
  onPaste,
}: {
  editorRef: React.RefObject<HTMLDivElement>
  disabled?: boolean
  placeholder: string
  value: string
  onChange: (value: string) => void
  onMentionState: (value: string, caret: number) => void
  onSubmit: () => void
  onEscape: () => void
  onAcceptMention: () => boolean
  onPaste?: (event: React.ClipboardEvent<HTMLDivElement>) => void
}) {
  const valueRef = React.useRef(value)

  React.useEffect(() => {
    valueRef.current = value
  }, [value])

  function syncFromEditor(kind: 'input' | 'click' | 'keyup') {
    const editor = editorRef.current
    if (!editor) return
    const started = performanceNow()
    const editorState = readMentionEditorState(editor)
    const serializedAt = performanceNow()
    if (editorState.value !== valueRef.current) {
      valueRef.current = editorState.value
      onChange(editorState.value)
    }
    onMentionState(editorState.textBeforeCaret, editorState.caret)
    const completedAt = performanceNow()
    recordComposerInputMetric('frontend_agent_composer_serialize_ms', serializedAt - started, kind, 'serialize')
    recordComposerInputMetric('frontend_agent_composer_input_latency_ms', completedAt - started, kind, 'handler')
    if (kind === 'input' && typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        recordComposerInputMetric('frontend_agent_composer_input_latency_ms', performanceNow() - started, kind, 'next_frame')
      })
    }
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
      onInput={() => syncFromEditor('input')}
      onClick={() => syncFromEditor('click')}
      onKeyUp={(event) => {
        if (!shouldSyncMentionEditorOnKeyUp(event)) return
        syncFromEditor('keyup')
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
        onPaste?.(event)
        if (event.defaultPrevented) return
        event.preventDefault()
        const text = event.clipboardData.getData('text/plain')
        document.execCommand('insertText', false, text)
      }}
    />
  )
}

function shouldSyncMentionEditorOnKeyUp(event: React.KeyboardEvent): boolean {
  if (event.key === 'Escape') return false
  if (event.key.startsWith('Arrow')) return true
  if (event.key === 'Home' || event.key === 'End' || event.key === 'PageUp' || event.key === 'PageDown') return true
  return event.ctrlKey || event.metaKey || event.altKey
}

function recordComposerInputMetric(
  name: 'frontend_agent_composer_input_latency_ms' | 'frontend_agent_composer_serialize_ms',
  value: number,
  kind: string,
  stage: string,
): void {
  if (!Number.isFinite(value) || value < 0) return
  if (value < 16 && Math.random() > 0.05) return
  recordAgentPerformanceMetric({
    name,
    value,
    unit: 'ms',
    labels: {
      component: 'agent_composer',
      kind,
      stage,
    },
  })
}
