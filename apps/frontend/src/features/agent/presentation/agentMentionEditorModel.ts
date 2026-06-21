import {
  formatResourceMention,
  parseResourceMentions,
} from '@movscript/workspace'
import { attachmentDisplayUrl, placeholderAttachment } from '@/features/agent/domain/agentAttachments'
import { loadResourceUrlBlob } from '@/shared/ui/resourceBlob'
import { acquireCachedResourceMediaUrl } from '@/shared/ui/resourceMediaCache'
import type { AgentAttachment } from '@/features/agent/state/agentStore'

export const RESOURCE_MENTION_RE = /@\[resource:(\d+)\]|\[\[resource::(\d+)\]\]/g
export const RESOURCE_MENTION_TRIGGER_RE = /(?:^|[\s(])@([^\s@\[]*)$/u

const mentionChipMediaReleases = new WeakMap<HTMLImageElement | HTMLVideoElement, () => void>()

export function resourceMentionToken(resourceId: number) {
  return formatResourceMention(resourceId)
}

export function normalizeInlineSpacing(text: string): string {
  return text.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n')
}

export function serializeMentionEditor(node: Node): string {
  const parts: string[] = []
  appendSerializedMentionEditor(node, parts)
  return parts.join('')
}

export function readMentionEditorState(editor: HTMLElement): { value: string; textBeforeCaret: string; caret: number } {
  const selection = window.getSelection()
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
  const hasCaret = !!range && editor.contains(range.endContainer)
  if (!hasCaret) {
    return {
      value: serializeMentionEditor(editor),
      textBeforeCaret: '',
      caret: 0,
    }
  }

  const state = {
    endContainer: range.endContainer,
    endOffset: range.endOffset,
    prefixActive: true,
    prefixParts: [] as string[],
    valueParts: [] as string[],
  }
  appendSerializedMentionEditorState(editor, state)
  const textBeforeCaret = state.prefixParts.join('')
  return {
    value: state.valueParts.join(''),
    textBeforeCaret,
    caret: textBeforeCaret.length,
  }
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
  const state = readMentionEditorState(editor)
  return { text: state.textBeforeCaret, caret: state.caret }
}

export function renderMentionEditorValue(editor: HTMLElement, value: string, attachmentsById: Map<number, AgentAttachment>) {
  releaseMentionEditorMedia(editor)
  editor.replaceChildren()
  let lastIndex = 0
  for (const mention of parseResourceMentions(value)) {
    const before = value.slice(lastIndex, mention.index)
    if (before) editor.appendChild(document.createTextNode(before))
    const attachment = attachmentsById.get(mention.id) ?? placeholderAttachment(mention.id)
    editor.appendChild(buildMentionChipElement(attachment))
    lastIndex = mention.index + mention.token.length
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

function appendSerializedMentionEditor(node: Node, parts: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    parts.push(node.textContent ?? '')
    return
  }
  const resourceId = mentionResourceId(node)
  if (resourceId !== undefined) {
    parts.push(`${resourceMentionToken(resourceId)} `)
    return
  }
  for (let child = node.firstChild; child; child = child.nextSibling) {
    appendSerializedMentionEditor(child, parts)
  }
}

function appendSerializedMentionEditorState(
  node: Node,
  state: {
    endContainer: Node
    endOffset: number
    prefixActive: boolean
    prefixParts: string[]
    valueParts: string[]
  },
): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ''
    state.valueParts.push(text)
    if (state.prefixActive) {
      if (node === state.endContainer) {
        state.prefixParts.push(text.slice(0, state.endOffset))
        state.prefixActive = false
      } else {
        state.prefixParts.push(text)
      }
    }
    return
  }

  const resourceId = mentionResourceId(node)
  if (resourceId !== undefined) {
    const token = `${resourceMentionToken(resourceId)} `
    state.valueParts.push(token)
    if (state.prefixActive) {
      state.prefixParts.push(token)
      if (node === state.endContainer || node.contains(state.endContainer)) state.prefixActive = false
    }
    return
  }

  if (node === state.endContainer) {
    let index = 0
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (state.prefixActive && index >= state.endOffset) state.prefixActive = false
      appendSerializedMentionEditorState(child, state)
      index += 1
    }
    state.prefixActive = false
    return
  }

  for (let child = node.firstChild; child; child = child.nextSibling) {
    appendSerializedMentionEditorState(child, state)
  }
}

function mentionResourceId(node: Node): number | undefined {
  if (node.nodeType !== Node.ELEMENT_NODE) return undefined
  const resourceId = (node as HTMLElement).dataset?.resourceId
  if (resourceId === undefined) return undefined
  const parsed = Number(resourceId)
  return Number.isFinite(parsed) ? parsed : undefined
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
