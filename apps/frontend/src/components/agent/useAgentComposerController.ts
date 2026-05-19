import { useMemo, useState } from 'react'
import type { DragEvent, RefObject } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { attachmentFromResource, attachmentKey, attachmentKind, dedupeAttachments, placeholderAttachment } from '@/lib/agentAttachments'
import { fetchResourceById } from '@/lib/agentMessageViewModel'
import {
  RESOURCE_MENTION_RE,
  RESOURCE_MENTION_TRIGGER_RE,
  mentionEditorTextBeforeCaret,
  normalizeInlineSpacing,
  resourceMentionToken,
  serializeMentionEditor,
  setCaretAtEnd,
} from '@/components/agent/AgentMentionEditor'
import { useAgentStore, type AgentAttachment } from '@/store/agentStore'
import type { RawResource } from '@/types'

interface UseAgentComposerControllerInput {
  userId: string
  conversationId: string
  draft: { input: string; attachments: AgentAttachment[] }
  recentResources: RawResource[]
  fileRef: RefObject<HTMLInputElement>
  inputRef: RefObject<HTMLDivElement>
}

export function stripAttachmentPreviewUrl(attachment: AgentAttachment): AgentAttachment {
  return { ...attachment, previewUrl: undefined }
}

export function useAgentComposerController({
  userId,
  conversationId,
  draft,
  recentResources,
  fileRef,
  inputRef,
}: UseAgentComposerControllerInput) {
  const qc = useQueryClient()
  const updateConversationDraft = useAgentStore((s) => s.updateConversationDraft)
  const [mentionRange, setMentionRange] = useState<{ start: number; end: number; query: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [draggingFiles, setDraggingFiles] = useState(false)
  const input = draft.input
  const attachments = draft.attachments

  const resourceAttachmentIndex = useMemo(() => {
    const map = new Map<number, AgentAttachment>()
    for (const attachment of attachments) {
      if (attachment.resourceId !== undefined) map.set(attachment.resourceId, attachment)
    }
    for (const resource of recentResources) {
      if (!map.has(resource.ID)) map.set(resource.ID, attachmentFromResource(resource))
    }
    return map
  }, [attachments, recentResources])

  const mentionedResourceIds = useMemo(() => {
    const ids = new Set<number>()
    for (const match of input.matchAll(RESOURCE_MENTION_RE)) {
      const id = Number(match[1])
      if (Number.isInteger(id) && id > 0) ids.add(id)
    }
    return ids
  }, [input])

  const mentionCandidates = useMemo(() => {
    const map = new Map<number, AgentAttachment>()
    for (const resource of recentResources) {
      map.set(resource.ID, attachmentFromResource(resource))
    }
    for (const attachment of attachments) {
      if (attachment.resourceId !== undefined) map.set(attachment.resourceId, attachment)
    }
    return Array.from(map.values()).filter((attachment) =>
      attachment.resourceId !== undefined
      && (attachment.type === 'image' || attachment.type === 'video' || attachment.type === 'audio')
    )
  }, [attachments, recentResources])

  const mentionResults = useMemo(() => {
    if (!mentionRange) return []
    const query = mentionRange.query.trim().toLowerCase()
    return mentionCandidates
      .filter((attachment) => !query || attachment.name.toLowerCase().includes(query) || String(attachment.resourceId).includes(query))
      .slice(0, 6)
  }, [mentionCandidates, mentionRange])

  const composerAttachmentEntries = useMemo(() => {
    const map = new Map<string, { attachment: AgentAttachment; explicit: boolean; mentioned: boolean }>()
    for (const attachment of attachments) {
      map.set(attachmentKey(attachment), { attachment, explicit: true, mentioned: false })
    }
    for (const resourceId of mentionedResourceIds) {
      const attachment = resourceAttachmentIndex.get(resourceId) ?? placeholderAttachment(resourceId)
      const key = attachmentKey(attachment)
      const existing = map.get(key)
      map.set(key, existing
        ? { ...existing, mentioned: true, attachment: existing.attachment.resourceId !== undefined ? existing.attachment : attachment }
        : { attachment, explicit: false, mentioned: true })
    }
    return Array.from(map.values())
  }, [attachments, mentionedResourceIds, resourceAttachmentIndex])

  const composerAttachments = useMemo(() => composerAttachmentEntries.map((entry) => entry.attachment), [composerAttachmentEntries])

  function updateDraft(patch: Partial<typeof draft>) {
    updateConversationDraft(userId, conversationId, patch)
  }

  function revokeAttachmentPreviewUrls(items: AgentAttachment[]) {
    for (const attachment of items) {
      if (attachment.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(attachment.previewUrl)
      }
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files)
    if (list.length === 0) return
    const pending = list.map((file) => {
      const kind = attachmentKind(file.type, file.name)
      const previewUrl = (kind === 'image' || kind === 'video') ? URL.createObjectURL(file) : undefined
      return {
        id: `upload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        type: kind,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        previewUrl,
      } satisfies AgentAttachment
    })
    const currentAttachments = useAgentStore.getState().getConversationDraft(userId, conversationId).attachments
    updateDraft({ attachments: [...currentAttachments, ...pending] })
    setUploading(true)
    try {
      const uploaded: AgentAttachment[] = []
      for (const [index, file] of list.entries()) {
        const fd = new FormData()
        fd.append('file', file)
        const { data } = await api.post('/resources/upload', fd)
        uploaded.push({
          ...attachmentFromResource(data as RawResource),
          id: pending[index]?.id ?? `res-${(data as RawResource).ID}`,
          previewUrl: pending[index]?.previewUrl,
        })
      }
      const latestAttachments = useAgentStore.getState().getConversationDraft(userId, conversationId).attachments
      const uploadedByPendingId = new Map(uploaded.map((attachment) => [attachment.id, attachment]))
      updateDraft({
        attachments: latestAttachments.map((attachment) => uploadedByPendingId.get(attachment.id) ?? attachment),
      })
      setMentionRange(null)
      qc.invalidateQueries({ queryKey: ['resources'] })
      qc.invalidateQueries({ queryKey: ['resources', 'agent-panel'] })
    } catch (e) {
      const latestAttachments = useAgentStore.getState().getConversationDraft(userId, conversationId).attachments
      const pendingIds = new Set(pending.map((attachment) => attachment.id))
      updateDraft({ attachments: latestAttachments.filter((attachment) => !pendingIds.has(attachment.id)) })
      revokeAttachmentPreviewUrls(pending)
      throw e
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function dataTransferTypes(event: DragEvent) {
    return Array.from(event.dataTransfer.types)
  }

  function hasFileDrop(event: DragEvent) {
    return dataTransferTypes(event).includes('Files') || event.dataTransfer.files.length > 0
  }

  function hasResourceDrop(event: DragEvent) {
    const types = dataTransferTypes(event)
    return types.includes('application/canvas-resource') || types.includes('application/resource-id')
  }

  function hasComposerDropData(event: DragEvent) {
    return hasFileDrop(event) || hasResourceDrop(event)
  }

  function parseDroppedResource(event: DragEvent): RawResource | null {
    const rawResource = event.dataTransfer.getData('application/canvas-resource')
    if (rawResource) {
      try {
        const parsed = JSON.parse(rawResource) as RawResource
        if (parsed && Number.isInteger(parsed.ID) && parsed.ID > 0) return parsed
      } catch {
        return null
      }
    }
    return null
  }

  async function addResourceFromDrop(event: DragEvent) {
    const droppedResource = parseDroppedResource(event)
    const resourceId = droppedResource?.ID ?? Number(event.dataTransfer.getData('application/resource-id'))
    if (!Number.isInteger(resourceId) || resourceId <= 0) return

    const resource = droppedResource ?? await fetchResourceById(resourceId)
    const nextAttachment = resource ? attachmentFromResource(resource) : placeholderAttachment(resourceId)
    const latestDraft = useAgentStore.getState().getConversationDraft(userId, conversationId)
    const nextInput = latestDraft.input.includes(resourceMentionToken(resourceId))
      ? latestDraft.input
      : normalizeInlineSpacing(`${latestDraft.input.trimEnd()} ${resourceMentionToken(resourceId)} `)
    updateDraft({
      input: nextInput,
      attachments: dedupeAttachments([...latestDraft.attachments, nextAttachment]),
    })
    setMentionRange(null)
    window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      if (inputRef.current) setCaretAtEnd(inputRef.current)
    })
  }

  function handleComposerDragOver(event: DragEvent) {
    if (!hasComposerDropData(event)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    setDraggingFiles(true)
  }

  function handleComposerDragEnter(event: DragEvent) {
    if (!hasComposerDropData(event)) return
    event.preventDefault()
    event.stopPropagation()
    setDraggingFiles(true)
  }

  function handleComposerDragLeave(event: DragEvent) {
    if (!hasComposerDropData(event)) return
    event.preventDefault()
    event.stopPropagation()
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setDraggingFiles(false)
  }

  async function handleComposerDrop(event: DragEvent) {
    if (!hasComposerDropData(event)) return
    event.preventDefault()
    event.stopPropagation()
    setDraggingFiles(false)
    if (hasFileDrop(event)) {
      await uploadFiles(event.dataTransfer.files)
      return
    }
    await addResourceFromDrop(event)
  }

  function updateMentionState(value: string, caret: number) {
    const before = value.slice(0, caret)
    const match = before.match(RESOURCE_MENTION_TRIGGER_RE)
    if (!match) {
      setMentionRange(null)
      return
    }
    setMentionRange({
      start: caret - match[1].length - 1,
      end: caret,
      query: match[1],
    })
  }

  function insertResourceMention(attachment: AgentAttachment) {
    if (attachment.resourceId === undefined) return
    const editor = inputRef.current
    const value = editor ? serializeMentionEditor(editor) : input
    const caretState = editor ? mentionEditorTextBeforeCaret(editor) : { text: value, caret: value.length }
    const start = mentionRange?.start ?? caretState.caret
    const end = mentionRange?.end ?? start
    const token = `${resourceMentionToken(attachment.resourceId)} `
    const next = `${value.slice(0, start)}${token}${value.slice(end)}`
    updateDraft({ input: next })
    setMentionRange(null)
    window.requestAnimationFrame(() => {
      editor?.focus()
      if (editor) setCaretAtEnd(editor)
    })
  }

  function addMentionTrigger() {
    const editor = inputRef.current
    const value = editor ? serializeMentionEditor(editor) : input
    const caretState = editor ? mentionEditorTextBeforeCaret(editor) : { text: value, caret: value.length }
    const start = caretState.caret
    const end = start
    const next = `${value.slice(0, start)}@${value.slice(end)}`
    updateDraft({ input: next })
    const caret = start + 1
    setMentionRange({ start, end: caret, query: '' })
    window.requestAnimationFrame(() => {
      editor?.focus()
      if (editor) setCaretAtEnd(editor)
    })
  }

  function removeAttachment(id: string) {
    const removed = composerAttachments.find((a) => a.id === id)
    updateDraft({ attachments: attachments.filter((a) => a.id !== id) })
    if (removed?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(removed.previewUrl)
    if (removed?.resourceId !== undefined) {
      const tokenPattern = new RegExp(`\\s*@\\[resource:${removed.resourceId}\\]\\s*`, 'g')
      updateDraft({ input: normalizeInlineSpacing(input.replace(tokenPattern, ' ')) })
    }
    setMentionRange(null)
  }

  return {
    attachments,
    composerAttachmentEntries,
    composerAttachments,
    draggingFiles,
    input,
    mentionRange,
    mentionResults,
    resourceAttachmentIndex,
    uploading,
    addMentionTrigger,
    handleComposerDragEnter,
    handleComposerDragLeave,
    handleComposerDragOver,
    handleComposerDrop,
    insertResourceMention,
    removeAttachment,
    revokeAttachmentPreviewUrls,
    setMentionRange,
    updateDraft,
    updateMentionState,
    uploadFiles,
  }
}
