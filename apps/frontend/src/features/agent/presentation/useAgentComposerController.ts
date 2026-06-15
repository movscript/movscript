import { useEffect, useMemo, useRef, useState } from 'react'
import type { ClipboardEvent, DragEvent, RefObject } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/infrastructure/api'
import { attachmentFromResource, attachmentKey, attachmentKind, dedupeAttachments, placeholderAttachment } from '@/features/agent/domain/agentAttachments'
import { fetchResourceById } from '@/features/agent/application/agentResourceLookup'
import {
  RESOURCE_MENTION_RE,
  RESOURCE_MENTION_TRIGGER_RE,
  normalizeInlineSpacing,
  readMentionEditorState,
  resourceMentionToken,
  setCaretAtEnd,
} from '@/features/agent/presentation/agentMentionEditorModel'
import { createObjectUrl, revokeObjectUrl } from '@/shared/ui/objectUrl'
import { registerAgentLocalFile, releaseAgentLocalFile } from '@/features/agent/application/agentLocalFileRegistry'
import type { AgentAttachment } from '@/features/agent/state/agentStore'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import type { MovScriptWorkspaceContext } from '@/shared/infrastructure/providerConfigStore'
import type { Project, RawResource } from '@/types'
import {
  acceptAgentComposerDropDragOver,
  agentComposerDropKind,
  readAgentComposerResourceDrop,
} from '@/features/agent/presentation/agentComposerDropInteraction'
import { invalidateResourceMutationResult, resourceLibraryChangedResult } from '@/features/resources/application/resourceMutationInvalidation'
import { agentProviderKeys } from '@/features/agent/application/agentQueryKeys'

const USER_WORKSPACE_VALUE = '__user__'

export interface AgentWorkspaceContextSelectOption {
  value: string
  label: string
  meta?: string
}

interface UseAgentComposerControllerInput {
  userId: string
  conversationId: string
  workspace: { input: string; attachments: AgentAttachment[]; workspaceContext?: MovScriptWorkspaceContext }
  recentResources: RawResource[]
  currentProject?: Project | null
  fileRef: RefObject<HTMLInputElement>
  inputRef: RefObject<HTMLDivElement>
  workspaceContextLocked?: boolean
}

export function useAgentComposerController({
  userId,
  conversationId,
  workspace,
  recentResources,
  currentProject = null,
  fileRef,
  inputRef,
  workspaceContextLocked = false,
}: UseAgentComposerControllerInput) {
  const qc = useQueryClient()
  const updateConversationWorkspace = useAgentSessionStore((s) => s.updateConversationWorkspace)
  const [mentionRange, setMentionRange] = useState<{ start: number; end: number; query: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadingFileNames, setUploadingFileNames] = useState<string[]>([])
  const [uploadedFileCount, setUploadedFileCount] = useState(0)
  const [draggingFiles, setDraggingFiles] = useState(false)
  const [input, setInput] = useState(workspace.input)
  const inputValueRef = useRef(workspace.input)
  const attachments = workspace.attachments
  const effectiveWorkspaceContext = useMemo(() => normalizeAgentWorkspaceContext(
    workspace.workspaceContext,
    workspaceContextLocked ? currentProject : null,
  ), [currentProject, workspace.workspaceContext, workspaceContextLocked])
  const selectedProjectId = positiveInteger(effectiveWorkspaceContext.projectId)
  const { data: projectsData = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: agentProviderKeys.composerWorkspaceProjects,
    queryFn: () => api.get('/projects').then((response) => response.data),
  })
  const projects = useMemo(() => mergeCurrentProject(projectsData, currentProject), [currentProject, projectsData])
  const workspaceProjectOptions = useMemo<AgentWorkspaceContextSelectOption[]>(() => [
    { value: USER_WORKSPACE_VALUE, label: '全局', meta: '不绑定项目' },
    ...projects
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((project) => ({
        value: String(project.ID),
        label: project.name || `项目 #${project.ID}`,
        meta: project.ID === currentProject?.ID
          ? '当前项目'
          : project.description || undefined,
      })),
  ], [currentProject?.ID, projects])
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
      .slice(0, 24)
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

  useEffect(() => {
    inputValueRef.current = workspace.input
    setInput(workspace.input)
  }, [conversationId, workspace.input])

  function updateInputValue(next: string, mode: 'defer' | 'immediate') {
    inputValueRef.current = next
    if (mode === 'immediate') {
      setInput((current) => current === next ? current : next)
    }
  }

  function updateInputDraft(next: string) {
    updateInputValue(next, 'defer')
  }

  function getInput() {
    return inputValueRef.current
  }

  function updateWorkspace(patch: Partial<typeof workspace>) {
    const nextPatch = { ...patch }
    if (Object.prototype.hasOwnProperty.call(nextPatch, 'input')) {
      updateInputValue(nextPatch.input ?? '', 'immediate')
      delete nextPatch.input
    }
    if (Object.keys(nextPatch).length === 0) return
    updateConversationWorkspace(userId, conversationId, nextPatch)
  }

  function changeWorkspaceProject(value: string) {
    if (workspaceContextLocked) return
    if (value === USER_WORKSPACE_VALUE) {
      updateWorkspace({ workspaceContext: { scope: 'global' } })
      return
    }
    const projectId = positiveInteger(value)
    if (projectId === undefined) return
    updateWorkspace({
      workspaceContext: {
        scope: 'project',
        projectId,
      },
    })
  }

  function revokeAttachmentPreviewUrls(items: AgentAttachment[]) {
    for (const attachment of items) {
      revokeObjectUrl(attachment.previewUrl)
      releaseLocalAttachmentSource(attachment)
    }
  }

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files)
    if (list.length === 0) return
    let pending: AgentAttachment[] = []
    setUploading(true)
    setUploadingFileNames(list.map((file, index) => file.name || `clipboard-${index + 1}`))
    setUploadedFileCount(0)
    try {
      pending = await Promise.all(list.map(async (file) => {
        const kind = attachmentKind(file.type, file.name)
        const previewUrl = (kind === 'image' || kind === 'video') ? createObjectUrl(file) : undefined
        const source = registerAgentLocalFile(file)
        return {
          id: `upload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name || 'clipboard-file',
          type: kind,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          previewUrl,
          source,
          ...(kind === 'image' ? { dataUrl: await fileToDataURL(file) } : {}),
        } satisfies AgentAttachment
      }))
      const currentAttachments = useAgentSessionStore.getState().getConversationWorkspace(userId, conversationId).attachments
      updateWorkspace({ attachments: [...currentAttachments, ...pending] })
      const uploaded: AgentAttachment[] = []
      for (const [index, file] of list.entries()) {
        const fd = new FormData()
        fd.append('file', file)
        const { data } = await api.post('/resources/upload', fd)
        setUploadedFileCount(index + 1)
        releaseLocalAttachmentSource(pending[index])
        uploaded.push({
          ...attachmentFromResource(data as RawResource),
          id: pending[index]?.id ?? `res-${(data as RawResource).ID}`,
          previewUrl: pending[index]?.previewUrl,
          ...(pending[index]?.dataUrl ? { dataUrl: pending[index].dataUrl } : {}),
        })
      }
      const latestAttachments = useAgentSessionStore.getState().getConversationWorkspace(userId, conversationId).attachments
      const uploadedByPendingId = new Map(uploaded.map((attachment) => [attachment.id, attachment]))
      updateWorkspace({
        attachments: latestAttachments.map((attachment) => uploadedByPendingId.get(attachment.id) ?? attachment),
      })
      setMentionRange(null)
      invalidateResourceMutationResult(qc, resourceLibraryChangedResult({ changedIds: uploaded.map(attachment => attachment.resourceId).filter((id): id is number => id !== undefined) }))
    } catch (e) {
      const latestAttachments = useAgentSessionStore.getState().getConversationWorkspace(userId, conversationId).attachments
      const pendingIds = new Set(pending.map((attachment) => attachment.id))
      updateWorkspace({ attachments: latestAttachments.filter((attachment) => !pendingIds.has(attachment.id)) })
      revokeAttachmentPreviewUrls(pending)
      releaseLocalAttachmentSources(pending)
      throw e
    } finally {
      setUploading(false)
      setUploadingFileNames([])
      setUploadedFileCount(0)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function fileToDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(reader.error ?? new Error('failed to read image attachment'))
      reader.readAsDataURL(file)
    })
  }

  function clipboardFiles(event: ClipboardEvent): File[] {
    const directFiles = Array.from(event.clipboardData.files)
    if (directFiles.length > 0) return directFiles.map(normalizeClipboardFile)

    return Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => !!file)
      .map(normalizeClipboardFile)
  }

  function normalizeClipboardFile(file: File, index: number): File {
    if (file.name.trim()) return file
    return new File([file], `clipboard-${Date.now().toString(36)}-${index + 1}${extensionForMime(file.type)}`, {
      type: file.type || 'application/octet-stream',
      lastModified: file.lastModified,
    })
  }

  function extensionForMime(mimeType: string) {
    if (mimeType === 'image/png') return '.png'
    if (mimeType === 'image/jpeg') return '.jpg'
    if (mimeType === 'image/webp') return '.webp'
    if (mimeType === 'image/gif') return '.gif'
    if (mimeType === 'video/mp4') return '.mp4'
    if (mimeType === 'audio/mpeg') return '.mp3'
    if (mimeType === 'audio/wav') return '.wav'
    if (mimeType.startsWith('text/')) return '.txt'
    return ''
  }

  function hasComposerDropData(event: DragEvent) {
    return Boolean(agentComposerDropKind(event.dataTransfer))
  }

  async function addResourceFromDrop(event: DragEvent) {
    const droppedResourcePayload = readAgentComposerResourceDrop(event.dataTransfer)
    if (!droppedResourcePayload) return

    const { resourceId } = droppedResourcePayload
    const resource = droppedResourcePayload.resource ?? await fetchResourceById(resourceId)
    const nextAttachment = resource ? attachmentFromResource(resource) : placeholderAttachment(resourceId)
    const latestWorkspace = useAgentSessionStore.getState().getConversationWorkspace(userId, conversationId)
    const latestInput = getInput()
    const nextInput = latestInput.includes(resourceMentionToken(resourceId))
      ? latestInput
      : normalizeInlineSpacing(`${latestInput.trimEnd()} ${resourceMentionToken(resourceId)} `)
    updateWorkspace({
      input: nextInput,
      attachments: dedupeAttachments([...latestWorkspace.attachments, nextAttachment]),
    })
    setMentionRange(null)
    window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      if (inputRef.current) setCaretAtEnd(inputRef.current)
    })
  }

  function handleComposerDragOver(event: DragEvent) {
    if (!acceptAgentComposerDropDragOver(event.dataTransfer)) return
    event.preventDefault()
    event.stopPropagation()
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
    if (agentComposerDropKind(event.dataTransfer) === 'files') {
      await uploadFiles(event.dataTransfer.files)
      return
    }
    await addResourceFromDrop(event)
  }

  async function handleComposerPaste(event: ClipboardEvent) {
    const files = clipboardFiles(event)
    if (files.length === 0) return
    event.preventDefault()
    event.stopPropagation()
    await uploadFiles(files)
  }

  function updateMentionState(value: string, caret: number) {
    const before = value.slice(0, caret)
    const match = before.match(RESOURCE_MENTION_TRIGGER_RE)
    if (!match) {
      setMentionRange((current) => current === null ? current : null)
      return
    }
    const nextRange = {
      start: caret - match[1].length - 1,
      end: caret,
      query: match[1],
    }
    setMentionRange((current) => sameMentionRange(current, nextRange) ? current : nextRange)
  }

  function insertResourceMention(attachment: AgentAttachment) {
    if (attachment.resourceId === undefined) return
    const editor = inputRef.current
    const editorState = editor ? readMentionEditorState(editor) : undefined
    const value = editorState?.value ?? getInput()
    const caret = editorState?.caret ?? value.length
    const start = mentionRange?.start ?? caret
    const end = mentionRange?.end ?? start
    const token = `${resourceMentionToken(attachment.resourceId)} `
    const next = `${value.slice(0, start)}${token}${value.slice(end)}`
    updateWorkspace({ input: next })
    setMentionRange(null)
    window.requestAnimationFrame(() => {
      editor?.focus()
      if (editor) setCaretAtEnd(editor)
    })
  }

  function addMentionTrigger() {
    const editor = inputRef.current
    const editorState = editor ? readMentionEditorState(editor) : undefined
    const value = editorState?.value ?? getInput()
    const start = editorState?.caret ?? value.length
    const end = start
    const next = `${value.slice(0, start)}@${value.slice(end)}`
    updateWorkspace({ input: next })
    const caret = start + 1
    setMentionRange({ start, end: caret, query: '' })
    window.requestAnimationFrame(() => {
      editor?.focus()
      if (editor) setCaretAtEnd(editor)
    })
  }

  function removeAttachment(id: string) {
    const removed = composerAttachments.find((a) => a.id === id)
    updateWorkspace({ attachments: attachments.filter((a) => a.id !== id) })
    revokeObjectUrl(removed?.previewUrl)
    releaseLocalAttachmentSource(removed)
    if (removed?.resourceId !== undefined) {
      const tokenPattern = new RegExp(`\\s*@\\[resource:${removed.resourceId}\\]\\s*`, 'g')
      updateWorkspace({ input: normalizeInlineSpacing(getInput().replace(tokenPattern, ' ')) })
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
    selectedWorkspaceContext: effectiveWorkspaceContext,
    workspaceProjectOptions,
    workspaceProjectValue: selectedProjectId === undefined ? USER_WORKSPACE_VALUE : String(selectedProjectId),
    workspaceContextLocked,
    workspaceProjectsLoading: projectsLoading,
    uploading,
    uploadedFileCount,
    uploadingFileNames,
    addMentionTrigger,
    handleComposerDragEnter,
    handleComposerDragLeave,
    handleComposerDragOver,
    handleComposerDrop,
    handleComposerPaste,
    insertResourceMention,
    getInput,
    changeWorkspaceProject,
    removeAttachment,
    revokeAttachmentPreviewUrls,
    setMentionRange,
    updateWorkspace,
    updateInputDraft,
    updateMentionState,
    uploadFiles,
  }
}

function releaseLocalAttachmentSources(items: AgentAttachment[]) {
  for (const item of items) {
    releaseLocalAttachmentSource(item)
  }
}

function releaseLocalAttachmentSource(attachment: AgentAttachment | undefined) {
  if (attachment?.source?.kind !== 'local_file') return
  releaseAgentLocalFile(attachment.source.fileId)
}

function normalizeAgentWorkspaceContext(
  context: MovScriptWorkspaceContext | undefined,
  lockedProject?: Project | null,
): MovScriptWorkspaceContext {
  const projectId = positiveInteger(context?.projectId)
  if ((context?.scope === 'project' || projectId !== undefined) && projectId !== undefined) {
    return {
      scope: 'project',
      projectId,
    }
  }
  if (lockedProject?.ID) {
    return {
      scope: 'project',
      projectId: lockedProject.ID,
    }
  }
  return {
    scope: 'global',
  }
}

function positiveInteger(value: unknown): number | undefined {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : undefined
}

function sameMentionRange(
  current: { start: number; end: number; query: string } | null,
  next: { start: number; end: number; query: string },
): boolean {
  return !!current
    && current.start === next.start
    && current.end === next.end
    && current.query === next.query
}

function mergeCurrentProject(projects: Project[], currentProject: Project | null): Project[] {
  if (!currentProject || projects.some((project) => project.ID === currentProject.ID)) return projects
  return [currentProject, ...projects]
}
