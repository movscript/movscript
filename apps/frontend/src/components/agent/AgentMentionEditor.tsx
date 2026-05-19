import React from 'react'
import { X } from 'lucide-react'
import { api } from '@/lib/api'
import { placeholderAttachment } from '@/lib/agentAttachments'
import { AuthedImage, AuthedVideo } from '@/components/shared/AuthedImage'
import {
  AgentAttachmentIcon as AttachmentIcon,
  attachmentDisplayUrl,
  formatAgentAttachmentBytes,
} from '@/components/agent/AgentMessageContent'
import { cn } from '@/lib/utils'
import type { AgentAttachment } from '@/store/agentStore'

export const RESOURCE_MENTION_RE = /@\[resource:(\d+)\]/g
export const RESOURCE_MENTION_TRIGGER_RE = /(?:^|[\s(])@([^\s@\[]*)$/u

export function resourceMentionToken(resourceId: number) {
  return `@[resource:${resourceId}]`
}

export function normalizeInlineSpacing(text: string): string {
  return text.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n')
}

export function serializeMentionEditor(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  const el = node as HTMLElement
  if (el.dataset?.resourceId) return `${resourceMentionToken(Number(el.dataset.resourceId))} `
  return Array.from(node.childNodes).map(serializeMentionEditor).join('')
}

export function setCaretAtEnd(element: HTMLElement) {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

export function mentionEditorTextBeforeCaret(editor: HTMLElement): { text: string; caret: number } {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !editor.contains(selection.anchorNode)) return { text: serializeMentionEditor(editor), caret: 0 }
  const caretRange = selection.getRangeAt(0).cloneRange()
  const prefixRange = document.createRange()
  prefixRange.selectNodeContents(editor)
  prefixRange.setEnd(caretRange.endContainer, caretRange.endOffset)
  const container = document.createElement('div')
  container.appendChild(prefixRange.cloneContents())
  const text = serializeMentionEditor(container)
  return { text, caret: text.length }
}

function isImeComposing(event: React.KeyboardEvent): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229
}

export function renderMentionEditorValue(editor: HTMLElement, value: string, attachmentsById: Map<number, AgentAttachment>) {
  editor.replaceChildren()
  let lastIndex = 0
  for (const match of value.matchAll(RESOURCE_MENTION_RE)) {
    if (match.index === undefined) continue
    const before = value.slice(lastIndex, match.index)
    if (before) editor.appendChild(document.createTextNode(before))
    const resourceId = Number(match[1])
    const attachment = attachmentsById.get(resourceId) ?? placeholderAttachment(resourceId)
    editor.appendChild(buildMentionChipElement(attachment))
    lastIndex = match.index + match[0].length
  }
  const rest = value.slice(lastIndex)
  if (rest) editor.appendChild(document.createTextNode(rest))
  if (!editor.childNodes.length) editor.appendChild(document.createTextNode(''))
}

export function hydrateMentionEditorMedia(editor: HTMLElement) {
  const mediaItems = Array.from(editor.querySelectorAll<HTMLImageElement | HTMLVideoElement>('.ai-agent-mention-chip__media'))
  for (const media of mediaItems) {
    const src = media.dataset.src
    if (!src || media.dataset.loadedSrc === src) continue
    const existingObjectUrl = media.dataset.objectUrl
    if (existingObjectUrl) URL.revokeObjectURL(existingObjectUrl)
    media.dataset.loadedSrc = src
    if (!mentionChipMediaNeedsAuth(src)) {
      media.src = src
      continue
    }
    api.get(src, { baseURL: '', responseType: 'blob' })
      .then((response) => {
        if (!media.isConnected || media.dataset.loadedSrc !== src) return
        const objectUrl = URL.createObjectURL(response.data)
        media.dataset.objectUrl = objectUrl
        media.src = objectUrl
      })
      .catch(() => {})
  }
}

function mentionChipMediaNeedsAuth(src: string): boolean {
  try {
    return new URL(src, window.location.origin).pathname.startsWith('/api/v1/resources/')
  } catch {
    return src.startsWith('/api/v1/resources/')
  }
}

function buildMentionChipElement(attachment: AgentAttachment): HTMLElement {
  const chip = document.createElement('span')
  chip.contentEditable = 'false'
  if (attachment.resourceId !== undefined) chip.dataset.resourceId = String(attachment.resourceId)
  chip.className = 'ai-agent-mention-chip'

  const media = document.createElement(attachment.type === 'video' ? 'video' : 'img') as HTMLImageElement | HTMLVideoElement
  media.className = 'ai-agent-mention-chip__media'
  if (attachment.type === 'video') {
    const video = media as HTMLVideoElement
    video.muted = true
    video.playsInline = true
    video.preload = 'metadata'
  } else {
    ;(media as HTMLImageElement).alt = attachment.name
  }
  const url = attachmentDisplayUrl(attachment)
  if (url) media.dataset.src = url
  chip.appendChild(media)

  const label = document.createElement('span')
  label.className = 'ai-agent-mention-chip__label'
  label.textContent = attachment.name
  chip.appendChild(label)
  return chip
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
    <AuthedImage src={url} alt={attachment.name} className="h-full w-full object-cover" />
  ) : attachment.type === 'video' && url ? (
    <AuthedVideo src={url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
  ) : (
    <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
      <AttachmentIcon type={attachment.type} size={10} />
    </div>
  )

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-background/70 px-2 py-1 text-[11px]">
      <span className="h-7 w-7 shrink-0 overflow-hidden rounded bg-muted/60">
        {preview}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate text-foreground">{attachment.name}</span>
        </div>
        <p className="truncate text-[9px] text-muted-foreground">{formatAgentAttachmentBytes(attachment.size)}</p>
      </div>
      <button type="button" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={onRemove} aria-label={`Remove ${attachment.name}`}>
        <X size={10} />
      </button>
    </div>
  )
}

export function MentionResourceOption({ attachment, onSelect }: { attachment: AgentAttachment; onSelect: () => void }) {
  const url = attachmentDisplayUrl(attachment)
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault()
        onSelect()
      }}
      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[11px] hover:bg-muted/60"
    >
      <span className="h-7 w-7 shrink-0 overflow-hidden rounded bg-muted">
        {attachment.type === 'image' && url ? (
          <AuthedImage src={url} alt={attachment.name} className="h-full w-full object-cover" />
        ) : attachment.type === 'video' && url ? (
          <AuthedVideo src={url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <AttachmentIcon type={attachment.type} size={10} />
          </div>
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-foreground">{attachment.name}</span>
      <span className="shrink-0 text-[9px] text-muted-foreground">
        {attachment.resourceId ? `#${attachment.resourceId}` : ''}
      </span>
    </button>
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
