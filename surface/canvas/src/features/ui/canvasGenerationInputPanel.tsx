import { useEffect, useMemo, useRef, useState } from 'react'
import { formatResourceMention } from '@movscript/workspace'
import { FileText, Image, Video, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { RawResource } from '@movscript/shared'
import {
  CanvasMentionAttachmentThumb,
  CanvasMentionMenuThumb,
  CanvasNodePromptInputView,
  canvasMentionChipClassNames,
  type CanvasNodeMentionItem,
  type CanvasNodePromptAttachmentItem,
} from '@movscript/ui/business/canvas'
import { selectedInputResources } from './canvasNodeUiAdapters'
import type { NodeDataWithHandlers } from './canvasNodeTypes'

function canvasResourceIcon(resource: Pick<RawResource, 'type'>, size = 12) {
  if (resource.type === 'image') return <Image size={size} />
  if (resource.type === 'video') return <Video size={size} />
  return <FileText size={size} />
}

function buildCanvasChipElement(resource: RawResource): HTMLElement {
  const chip = document.createElement('span')
  chip.contentEditable = 'false'
  chip.dataset.resourceName = resource.name
  chip.dataset.resourceId = String(resource.ID)
  chip.className = canvasMentionChipClassNames.chip

  const media = document.createElement('span')
  media.className = canvasMentionChipClassNames.media
  media.dataset.type = resource.type
  media.textContent = resource.type === 'video' ? 'V' : resource.type === 'image' ? 'I' : 'T'
  chip.appendChild(media)

  const label = document.createElement('span')
  label.textContent = resource.name
  label.className = canvasMentionChipClassNames.label
  chip.appendChild(label)

  return chip
}

function serializeCanvasPrompt(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  const el = node as HTMLElement
  if (el.dataset?.resourceId) return formatResourceMention(Number(el.dataset.resourceId))
  return Array.from(node.childNodes).map(serializeCanvasPrompt).join('')
}

export function CanvasGenerationInputPanel({
  data,
  inputType,
  placeholder,
}: {
  data: NodeDataWithHandlers
  inputType?: 'image' | 'video' | 'image+video'
  placeholder?: string
}) {
  const { t } = useTranslation()
  const editorRef = useRef<HTMLDivElement>(null)
  const mentionRangeRef = useRef<{ node: Text; start: number; end: number } | null>(null)
  const syncedPromptRef = useRef<string | null>(null)
  const renderedResourceKeyRef = useRef<string>('')
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const attachments = useMemo(
    () => selectedInputResources(data),
    [data.availableResources, data.inputResourceIds, data.prompt, data.referenceResources],
  )
  const explicitResourceIds = new Set(data.inputResourceIds ?? [])
  const mentionResources = attachments
    .filter((resource) => !mentionQuery || resource.name.toLowerCase().includes(mentionQuery))
    .slice(0, 8)
  const mentionItems: CanvasNodeMentionItem[] = mentionResources.map((resource) => ({
    id: resource.ID,
    media: (
      <CanvasMentionMenuThumb>
        {canvasResourceIcon(resource, 12)}
      </CanvasMentionMenuThumb>
    ),
    label: resource.name,
    meta: `#${resource.ID}`,
    onMouseDown: (event) => {
      event.preventDefault()
      insertMention(resource)
    },
  }))
  const attachmentItems: CanvasNodePromptAttachmentItem[] = attachments.map((resource) => {
    const removable = explicitResourceIds.has(resource.ID)
    return {
      id: resource.ID,
      media: (
        <CanvasMentionAttachmentThumb>
          {canvasResourceIcon(resource, 12)}
        </CanvasMentionAttachmentThumb>
      ),
      label: resource.name,
      removable,
      removeLabel: t('common.remove', { defaultValue: 'Remove' }),
      removeIcon: <X size={10} />,
      onRemove: removable ? () => data.onUpdateAttachments?.((data.inputResourceIds ?? []).filter((id) => id !== resource.ID)) : undefined,
      status: t('canvas.editor.connected', { defaultValue: 'Connected' }),
    }
  })
  const resourceById = useMemo(() => new Map(attachments.map((resource) => [resource.ID, resource])), [attachments])
  const resourceLookupKey = useMemo(
    () => attachments.map((resource) => `${resource.ID}:${resource.type}:${resource.name}:${resource.url}:${resource.direct_url ?? ''}`).join('|'),
    [attachments],
  )

  function editorText() {
    return editorRef.current ? serializeCanvasPrompt(editorRef.current) : ''
  }

  function handleInput() {
    const text = editorText()
    syncedPromptRef.current = text
    data.onUpdatePrompt?.(text)

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      setMentionQuery(null)
      return
    }
    const range = selection.getRangeAt(0)
    const node = range.startContainer
    if (node.nodeType !== Node.TEXT_NODE) {
      mentionRangeRef.current = null
      setMentionQuery(null)
      return
    }
    const before = (node.textContent ?? '').slice(0, range.startOffset)
    const match = before.match(/@([^\s@]*)$/)
    if (match) {
      const query = match[1]
      if (query === undefined) return
      mentionRangeRef.current = {
        node: node as Text,
        start: range.startOffset - match[0].length,
        end: range.startOffset,
      }
      setMentionQuery(query.toLowerCase())
    } else {
      mentionRangeRef.current = null
      setMentionQuery(null)
    }
  }

  function insertMention(resource: RawResource) {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || !editorRef.current) return
    let insertRange = selection.getRangeAt(0)
    const mentionRange = mentionRangeRef.current
    if (mentionRange && mentionRange.node.isConnected) {
      const deleteRange = document.createRange()
      deleteRange.setStart(mentionRange.node, mentionRange.start)
      deleteRange.setEnd(mentionRange.node, mentionRange.end)
      deleteRange.deleteContents()
      insertRange = deleteRange
      selection.removeAllRanges()
      selection.addRange(insertRange)
    } else {
      const node = insertRange.startContainer
      if (node.nodeType === Node.TEXT_NODE) {
        const before = (node.textContent ?? '').slice(0, insertRange.startOffset)
        const match = before.match(/@([^\s@]*)$/)
        if (match) {
          const deleteRange = document.createRange()
          deleteRange.setStart(node, insertRange.startOffset - match[0].length)
          deleteRange.setEnd(node, insertRange.startOffset)
          deleteRange.deleteContents()
          insertRange = deleteRange
          selection.removeAllRanges()
          selection.addRange(insertRange)
        }
      }
    }

    const chip = buildCanvasChipElement(resource)
    const space = document.createTextNode(' ')
    insertRange.insertNode(space)
    insertRange.insertNode(chip)

    const nextRange = document.createRange()
    nextRange.setStartAfter(space)
    nextRange.collapse(true)
    selection.removeAllRanges()
    selection.addRange(nextRange)

    setMentionQuery(null)
    mentionRangeRef.current = null
    const nextText = editorText()
    syncedPromptRef.current = nextText
    data.onUpdatePrompt?.(nextText)
  }

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const prompt = data.prompt ?? ''
    const currentPrompt = serializeCanvasPrompt(editor)
    const isFocused = document.activeElement === editor || (document.activeElement ? editor.contains(document.activeElement) : false)
    if (currentPrompt === prompt && renderedResourceKeyRef.current === resourceLookupKey) {
      syncedPromptRef.current = prompt
      return
    }
    if (isFocused && syncedPromptRef.current === currentPrompt) return
    if (isFocused && syncedPromptRef.current === prompt) return
    editor.innerHTML = ''
    const pattern = /@\[resource:(\d+)\]\s?/g
    let lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(prompt)) !== null) {
      const before = prompt.slice(lastIndex, match.index)
      if (before) editor.appendChild(document.createTextNode(before))
      const resource = resourceById.get(Number(match[1]))
      if (resource) {
        const chip = buildCanvasChipElement(resource)
        editor.appendChild(chip)
        editor.appendChild(document.createTextNode(' '))
      } else {
        editor.appendChild(document.createTextNode(match[0]))
      }
      lastIndex = pattern.lastIndex
    }
    const after = prompt.slice(lastIndex)
    if (after) editor.appendChild(document.createTextNode(after))
    syncedPromptRef.current = prompt
    renderedResourceKeyRef.current = resourceLookupKey
  }, [data.prompt, resourceById, resourceLookupKey])

  return (
    <CanvasNodePromptInputView
      editorRef={editorRef}
      placeholder={placeholder ?? (inputType ? t(`shared.genInput.promptPlaceholder.${inputType}`, { defaultValue: t('shared.generation.promptPlaceholder') }) : t('shared.generation.promptPlaceholder'))}
      onEditorInput={handleInput}
      onEditorEscape={() => setMentionQuery(null)}
      mentionOpen={mentionQuery !== null}
      mentionItems={mentionItems}
      mentionEmptyLabel={attachments.length === 0 ? t('shared.genInput.addResourcesFirst') : t('shared.genInput.noMatchedResources')}
      attachmentItems={attachmentItems}
      attachmentEmptyLabel={t('shared.genInput.selectOrUploadHint', { defaultValue: 'Select or upload resources' })}
    />
  )
}
