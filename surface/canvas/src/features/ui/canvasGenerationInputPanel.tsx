import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { formatResourceMention, parseResourceMentions } from '@movscript/workspace'
import {
  generationDefaultReferenceRoleForMediaType,
  generationReferenceMediaTypeShortLabel,
  generationReferenceRoleLabel,
  generationReferenceRoleOptionsForMediaType,
} from '@movscript/core/generation'
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
import { GenerationReferenceRoleMenu } from '@movscript/ui/business/generation'
import { selectedInputResources } from './canvasNodeUiAdapters'
import type { NodeDataWithHandlers } from './canvasNodeTypes'

function canvasResourceIcon(resource: Pick<RawResource, 'type'>, size = 12) {
  if (resource.type === 'image') return <Image size={size} />
  if (resource.type === 'video') return <Video size={size} />
  return <FileText size={size} />
}

type CanvasPromptReferenceMetadata = {
  role?: string
  mediaType?: string
  sourceLabel?: string
}

function canvasPromptReferenceChipLabel(metadata: CanvasPromptReferenceMetadata = {}): string {
  const roleLabel = generationReferenceRoleLabel(metadata.role)
  return `${roleLabel || '参考'} · ${metadata.sourceLabel ?? '资源'}`
}

function buildCanvasChipElement(resource: RawResource, metadata: CanvasPromptReferenceMetadata = {}): HTMLElement {
  const chip = document.createElement('span')
  chip.contentEditable = 'false'
  chip.dataset.resourceName = resource.name
  chip.dataset.resourceId = String(resource.ID)
  chip.dataset.sourceLabel = metadata.sourceLabel ?? '资源'
  if (metadata.role) chip.dataset.role = metadata.role
  if (metadata.mediaType) chip.dataset.mediaType = metadata.mediaType
  chip.title = [
    resource.name,
    generationReferenceRoleLabel(metadata.role),
    metadata.sourceLabel ?? '资源',
  ].filter(Boolean).join(' · ')
  chip.className = canvasMentionChipClassNames.chip

  const media = document.createElement('span')
  media.className = canvasMentionChipClassNames.media
  media.dataset.type = metadata.mediaType ?? resource.type
  media.textContent = generationReferenceMediaTypeShortLabel(metadata.mediaType ?? resource.type)
  chip.appendChild(media)

  const label = document.createElement('span')
  label.textContent = canvasPromptReferenceChipLabel(metadata)
  label.className = canvasMentionChipClassNames.label
  chip.appendChild(label)

  return chip
}

function serializeCanvasPrompt(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  const el = node as HTMLElement
  if (el.dataset?.resourceId) {
    return formatResourceMention(Number(el.dataset.resourceId), {
      mediaType: el.dataset.mediaType,
      role: el.dataset.role,
    })
  }
  return Array.from(node.childNodes).map(serializeCanvasPrompt).join('')
}

type CanvasRoleMenuState = {
  left: number
  top: number
  resourceId: number
  mediaType?: string
  role?: string
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
  const shellRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const roleMenuChipRef = useRef<HTMLElement | null>(null)
  const mentionRangeRef = useRef<{ node: Text; start: number; end: number } | null>(null)
  const syncedPromptRef = useRef<string | null>(null)
  const renderedResourceKeyRef = useRef<string>('')
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionMenuStyle, setMentionMenuStyle] = useState<CSSProperties | undefined>(undefined)
  const [roleMenu, setRoleMenu] = useState<CanvasRoleMenuState | null>(null)
  const attachments = useMemo(
    () => selectedInputResources(data),
    [data.availableResources, data.inputResourceIds, data.referenceResources, data.runtimeInputValues],
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
  const referenceMetadataById = useMemo(() => {
    const out = new Map<number, CanvasPromptReferenceMetadata>()
    for (const values of Object.values(data.runtimeInputValues ?? {})) {
      for (const value of values) {
        if (!value.resource_id) continue
        const mediaType = value.media_type && value.media_type !== 'any' && value.media_type !== 'text'
          ? value.media_type
          : value.type
        out.set(value.resource_id, {
          mediaType,
          role: value.role || generationDefaultReferenceRoleForMediaType(mediaType),
        })
      }
    }
    for (const resource of attachments) {
      if (out.has(resource.ID)) continue
      out.set(resource.ID, {
        mediaType: resource.type,
        role: generationDefaultReferenceRoleForMediaType(resource.type),
      })
    }
    return out
  }, [attachments, data.runtimeInputValues])
  const resourceLookupKey = useMemo(
    () => attachments.map((resource) => `${resource.ID}:${resource.type}:${resource.name}:${resource.url}:${resource.direct_url ?? ''}`).join('|'),
    [attachments],
  )
  const mentionMenuPortalContainer = typeof document === 'undefined' ? null : document.body

  useLayoutEffect(() => {
    if (mentionQuery === null) {
      setMentionMenuStyle(undefined)
      return
    }
    const update = () => {
      setMentionMenuStyle(canvasMentionMenuStyleFromAnchor(shellRef.current?.getBoundingClientRect()))
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [mentionItems.length, mentionQuery])

  function editorText() {
    return editorRef.current ? serializeCanvasPrompt(editorRef.current) : ''
  }

  function handleInput() {
    setRoleMenu(null)
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

    const chip = buildCanvasChipElement(resource, referenceMetadataById.get(resource.ID))
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

  function handlePanelMouseDown(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null
    const chip = target?.closest<HTMLElement>('[data-resource-id]')
    if (!chip || !editorRef.current?.contains(chip)) {
      setRoleMenu(null)
      roleMenuChipRef.current = null
      return
    }
    event.preventDefault()
    const resourceId = Number(chip.dataset.resourceId)
    if (!Number.isInteger(resourceId)) return
    const shellRect = shellRef.current?.getBoundingClientRect()
    const chipRect = chip.getBoundingClientRect()
    const resource = resourceById.get(resourceId)
    const mediaType = chip.dataset.mediaType ?? resource?.type
    roleMenuChipRef.current = chip
    setMentionQuery(null)
    setRoleMenu({
      resourceId,
      mediaType,
      role: chip.dataset.role ?? generationDefaultReferenceRoleForMediaType(mediaType),
      left: shellRect ? Math.max(4, Math.min(chipRect.left - shellRect.left, shellRect.width - 184)) : 0,
      top: shellRect ? chipRect.bottom - shellRect.top + 6 : 0,
    })
  }

  function selectResourceRole(role: string) {
    const chip = roleMenuChipRef.current
    if (!chip || !editorRef.current) {
      setRoleMenu(null)
      return
    }
    const mediaType = roleMenu?.mediaType ?? chip.dataset.mediaType
    chip.dataset.role = role
    if (mediaType) chip.dataset.mediaType = mediaType
    const label = chip.querySelector<HTMLElement>(`.${canvasMentionChipClassNames.label}`)
    if (label) {
      label.textContent = canvasPromptReferenceChipLabel({
        role,
        mediaType,
        sourceLabel: chip.dataset.sourceLabel,
      })
    }
    const nextText = editorText()
    syncedPromptRef.current = nextText
    data.onUpdatePrompt?.(nextText)
    setRoleMenu(null)
    roleMenuChipRef.current = null
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
    let lastIndex = 0
    for (const mention of parseResourceMentions(prompt)) {
      const before = prompt.slice(lastIndex, mention.index)
      if (before) editor.appendChild(document.createTextNode(before))
      const resource = resourceById.get(mention.id)
      if (resource) {
        const fallbackMetadata = referenceMetadataById.get(mention.id)
        const chip = buildCanvasChipElement(resource, {
          mediaType: mention.mediaType ?? fallbackMetadata?.mediaType,
          role: mention.role ?? fallbackMetadata?.role,
        })
        editor.appendChild(chip)
        editor.appendChild(document.createTextNode(' '))
      } else {
        editor.appendChild(document.createTextNode(mention.token))
      }
      lastIndex = mention.index + mention.token.length
    }
    const after = prompt.slice(lastIndex)
    if (after) editor.appendChild(document.createTextNode(after))
    syncedPromptRef.current = prompt
    renderedResourceKeyRef.current = resourceLookupKey
  }, [data.prompt, referenceMetadataById, resourceById, resourceLookupKey])

  return (
    <div ref={shellRef} style={{ position: 'relative' }}>
      <CanvasNodePromptInputView
        editorRef={editorRef}
        placeholder={placeholder ?? (inputType ? t(`shared.genInput.promptPlaceholder.${inputType}`, { defaultValue: t('shared.generation.promptPlaceholder') }) : t('shared.generation.promptPlaceholder'))}
        onEditorInput={handleInput}
        onEditorEscape={() => {
          setMentionQuery(null)
          setRoleMenu(null)
        }}
        onMouseDown={handlePanelMouseDown}
        mentionOpen={mentionQuery !== null}
        mentionItems={mentionItems}
        mentionEmptyLabel={attachments.length === 0 ? t('shared.genInput.addResourcesFirst') : t('shared.genInput.noMatchedResources')}
        mentionMenuPortalContainer={mentionMenuPortalContainer}
        mentionMenuStyle={mentionMenuStyle}
        attachmentItems={attachmentItems}
        attachmentEmptyLabel={t('shared.genInput.selectOrUploadHint', { defaultValue: 'Select or upload resources' })}
      />
      {roleMenu ? (
        <GenerationReferenceRoleMenu
          options={generationReferenceRoleOptionsForMediaType(roleMenu.mediaType)}
          value={roleMenu.role}
          onRoleSelect={selectResourceRole}
          style={{ left: roleMenu.left, top: roleMenu.top }}
        />
      ) : null}
    </div>
  )
}

function canvasMentionMenuStyleFromAnchor(rect: DOMRect | undefined): CSSProperties | undefined {
  if (!rect || typeof window === 'undefined') return undefined
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const gutter = 8
  const width = Math.min(Math.max(rect.width, 220), Math.max(220, viewportWidth - gutter * 2))
  const left = Math.max(gutter, Math.min(rect.left, viewportWidth - width - gutter))
  const spaceAbove = Math.max(0, rect.top - gutter)
  const spaceBelow = Math.max(0, viewportHeight - rect.bottom - gutter)
  const placeAbove = spaceAbove >= 96 || spaceAbove >= spaceBelow
  const maxHeight = Math.max(72, Math.min(240, (placeAbove ? spaceAbove : spaceBelow) - 6))
  return {
    position: 'fixed',
    zIndex: 1200,
    left,
    right: 'auto',
    width,
    maxHeight,
    ...(placeAbove
      ? { top: 'auto', bottom: Math.max(gutter, viewportHeight - rect.top + 6) }
      : { top: Math.min(viewportHeight - gutter - 72, rect.bottom + 6), bottom: 'auto' }),
  }
}
