import { attachmentDisplayUrl, placeholderAttachment } from '@/features/agent/domain/agentAttachments'
import { loadResourceUrlBlob } from '@/shared/ui/resourceBlob'
import { acquireCachedResourceMediaUrl } from '@/shared/ui/resourceMediaCache'
import type { AgentAttachment } from '@/features/agent/state/agentStore'

export const RESOURCE_MENTION_RE = /@\[resource:(\d+)\]/g
export const RESOURCE_MENTION_TRIGGER_RE = /(?:^|[\s(])@([^\s@\[]*)$/u

const mentionChipMediaReleases = new WeakMap<HTMLImageElement | HTMLVideoElement, () => void>()

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

export function renderMentionEditorValue(editor: HTMLElement, value: string, attachmentsById: Map<number, AgentAttachment>) {
  releaseMentionEditorMedia(editor)
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
    mentionChipMediaReleases.get(media)?.()
    mentionChipMediaReleases.delete(media)
    media.dataset.loadedSrc = src
    if (!mentionChipMediaNeedsAuth(src)) {
      media.src = src
      continue
    }
    acquireCachedResourceMediaUrl(src, () => loadResourceUrlBlob(src))
      .then((cached) => {
        if (!media.isConnected || media.dataset.loadedSrc !== src) {
          cached.release()
          return
        }
        mentionChipMediaReleases.set(media, cached.release)
        media.src = cached.url
      })
      .catch(() => {})
  }
}

function releaseMentionEditorMedia(editor: HTMLElement) {
  const mediaItems = Array.from(editor.querySelectorAll<HTMLImageElement | HTMLVideoElement>('.ai-agent-mention-chip__media'))
  for (const media of mediaItems) {
    mentionChipMediaReleases.get(media)?.()
    mentionChipMediaReleases.delete(media)
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
