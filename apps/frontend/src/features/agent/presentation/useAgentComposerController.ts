import { useMemo, useState } from 'react'
import type { ClipboardEvent, DragEvent, RefObject } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/shared/infrastructure/api'
import { attachmentFromResource, attachmentKey, attachmentKind, dedupeAttachments, placeholderAttachment } from '@/features/agent/domain/agentAttachments'
import { fetchResourceById } from '@/features/agent/domain/agentResourceLookup'
import { listSemanticEntities, semanticEntityConfig, type SemanticEntityRecord } from '@/shared/infrastructure/api/semanticEntities'
import {
  RESOURCE_MENTION_RE,
  RESOURCE_MENTION_TRIGGER_RE,
  mentionEditorTextBeforeCaret,
  normalizeInlineSpacing,
  resourceMentionToken,
  serializeMentionEditor,
  setCaretAtEnd,
} from '@/features/agent/presentation/agentMentionEditorModel'
import { createObjectUrl, revokeObjectUrl } from '@/shared/ui/objectUrl'
import type { AgentAttachment } from '@/features/agent/state/agentStore'
import { useAgentSessionStore } from '@/features/agent/state/agentSessionStore'
import { useProjectStore } from '@/shared/infrastructure/session/projectStore'
import type { MovScriptWorkspaceContext } from '@/shared/infrastructure/providerConfigStore'
import type { Project, RawResource } from '@/types'

const USER_WORKSPACE_VALUE = '__user__'
const PROJECT_WORKSPACE_VALUE = '__project__'

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
  fileRef: RefObject<HTMLInputElement>
  inputRef: RefObject<HTMLDivElement>
}

export function useAgentComposerController({
  userId,
  conversationId,
  workspace,
  recentResources,
  fileRef,
  inputRef,
}: UseAgentComposerControllerInput) {
  const qc = useQueryClient()
  const location = useLocation()
  const currentProject = useProjectStore((s) => s.current)
  const updateConversationWorkspace = useAgentSessionStore((s) => s.updateConversationWorkspace)
  const [mentionRange, setMentionRange] = useState<{ start: number; end: number; query: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadingFileNames, setUploadingFileNames] = useState<string[]>([])
  const [uploadedFileCount, setUploadedFileCount] = useState(0)
  const [draggingFiles, setDraggingFiles] = useState(false)
  const input = workspace.input
  const attachments = workspace.attachments
  const routeProductionId = useMemo(() => productionIdFromLocation(location.pathname, location.search), [location.pathname, location.search])
  const effectiveWorkspaceContext = useMemo(() => normalizeAgentWorkspaceContext(
    workspace.workspaceContext,
    {
      userId,
      projectId: currentProject?.ID,
      productionId: routeProductionId,
    },
  ), [currentProject?.ID, routeProductionId, userId, workspace.workspaceContext])
  const selectedProjectId = positiveInteger(effectiveWorkspaceContext.projectId)
  const selectedProductionId = effectiveWorkspaceContext.scope === 'production'
    ? positiveInteger(effectiveWorkspaceContext.productionId)
    : undefined
  const { data: projectsData = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ['agent-composer-workspace-projects'],
    queryFn: () => api.get('/projects').then((response) => response.data),
  })
  const projects = useMemo(() => mergeCurrentProject(projectsData, currentProject), [currentProject, projectsData])
  const { data: productions = [], isLoading: productionsLoading } = useQuery<SemanticEntityRecord[]>({
    queryKey: ['agent-composer-workspace-productions', selectedProjectId],
    queryFn: () => listSemanticEntities(selectedProjectId!, semanticEntityConfig('productions')),
    enabled: selectedProjectId !== undefined,
  })
  const workspaceProjectOptions = useMemo<AgentWorkspaceContextSelectOption[]>(() => [
    { value: USER_WORKSPACE_VALUE, label: '用户根', meta: '所有项目' },
    ...projects
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((project) => ({
        value: String(project.ID),
        label: project.name || `项目 #${project.ID}`,
        meta: project.status || undefined,
      })),
  ], [projects])
  const selectedProject = selectedProjectId !== undefined
    ? projects.find((project) => project.ID === selectedProjectId) ?? null
    : null
  const workspaceProductionOptions = useMemo<AgentWorkspaceContextSelectOption[]>(() => {
    if (selectedProjectId === undefined) return []
    const sortedProductions = productions
      .slice()
      .sort((a, b) => workspaceRecordLabel(a, '制作').localeCompare(workspaceRecordLabel(b, '制作')))
      .map((production) => ({
        value: String(production.ID),
        label: workspaceRecordLabel(production, '制作'),
        meta: stringValue(production.status),
      }))
    return [
      {
        value: PROJECT_WORKSPACE_VALUE,
        label: '项目根',
        meta: selectedProject?.name || `项目 #${selectedProjectId}`,
      },
      ...sortedProductions,
    ]
  }, [productions, selectedProject?.name, selectedProjectId])

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

  function updateWorkspace(patch: Partial<typeof workspace>) {
    updateConversationWorkspace(userId, conversationId, patch)
  }

  function changeWorkspaceProject(value: string) {
    if (value === USER_WORKSPACE_VALUE) {
      updateWorkspace({ workspaceContext: { scope: 'global', ...(userId ? { userId } : {}) } })
      return
    }
    const projectId = positiveInteger(value)
    if (projectId === undefined) return
    updateWorkspace({
      workspaceContext: {
        scope: 'project',
        ...(userId ? { userId } : {}),
        projectId,
      },
    })
  }

  function changeWorkspaceProduction(value: string) {
    if (selectedProjectId === undefined) return
    if (value === PROJECT_WORKSPACE_VALUE) {
      updateWorkspace({
        workspaceContext: {
          scope: 'project',
          ...(userId ? { userId } : {}),
          projectId: selectedProjectId,
        },
      })
      return
    }
    const productionId = positiveInteger(value)
    if (productionId === undefined) return
    updateWorkspace({
      workspaceContext: {
        scope: 'production',
        ...(userId ? { userId } : {}),
        projectId: selectedProjectId,
        productionId,
      },
    })
  }

  function revokeAttachmentPreviewUrls(items: AgentAttachment[]) {
    for (const attachment of items) {
      revokeObjectUrl(attachment.previewUrl)
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
        return {
          id: `upload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name || 'clipboard-file',
          type: kind,
          mimeType: file.type || 'application/octet-stream',
          size: file.size,
          previewUrl,
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
      qc.invalidateQueries({ queryKey: ['resources'] })
      qc.invalidateQueries({ queryKey: ['resources', 'agent-panel'] })
    } catch (e) {
      const latestAttachments = useAgentSessionStore.getState().getConversationWorkspace(userId, conversationId).attachments
      const pendingIds = new Set(pending.map((attachment) => attachment.id))
      updateWorkspace({ attachments: latestAttachments.filter((attachment) => !pendingIds.has(attachment.id)) })
      revokeAttachmentPreviewUrls(pending)
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

  function dataTransferTypes(event: DragEvent) {
    return Array.from(event.dataTransfer.types)
  }

  function hasFileDrop(event: DragEvent) {
    return dataTransferTypes(event).includes('Files') || event.dataTransfer.files.length > 0
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
    const latestWorkspace = useAgentSessionStore.getState().getConversationWorkspace(userId, conversationId)
    const nextInput = latestWorkspace.input.includes(resourceMentionToken(resourceId))
      ? latestWorkspace.input
      : normalizeInlineSpacing(`${latestWorkspace.input.trimEnd()} ${resourceMentionToken(resourceId)} `)
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
    updateWorkspace({ input: next })
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
    if (removed?.resourceId !== undefined) {
      const tokenPattern = new RegExp(`\\s*@\\[resource:${removed.resourceId}\\]\\s*`, 'g')
      updateWorkspace({ input: normalizeInlineSpacing(input.replace(tokenPattern, ' ')) })
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
    workspaceProjectsLoading: projectsLoading,
    workspaceProductionOptions,
    workspaceProductionValue: selectedProductionId === undefined ? PROJECT_WORKSPACE_VALUE : String(selectedProductionId),
    workspaceProductionsLoading: productionsLoading,
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
    changeWorkspaceProduction,
    changeWorkspaceProject,
    removeAttachment,
    revokeAttachmentPreviewUrls,
    setMentionRange,
    updateWorkspace,
    updateMentionState,
    uploadFiles,
  }
}

function normalizeAgentWorkspaceContext(
  context: MovScriptWorkspaceContext | undefined,
  fallback: { userId: string; projectId?: number; productionId?: number },
): MovScriptWorkspaceContext {
  const userId = stringValue(context?.userId) ?? (fallback.userId || undefined)
  const projectId = positiveInteger(context?.projectId)
  const productionId = positiveInteger(context?.productionId)
  if (context?.scope === 'production' && projectId !== undefined && productionId !== undefined) {
    return {
      scope: 'production',
      ...(userId ? { userId } : {}),
      projectId,
      productionId,
    }
  }
  if ((context?.scope === 'project' || projectId !== undefined) && projectId !== undefined) {
    return {
      scope: 'project',
      ...(userId ? { userId } : {}),
      projectId,
    }
  }
  if (fallback.projectId !== undefined) {
    if (fallback.productionId !== undefined) {
      return {
        scope: 'production',
        ...(fallback.userId ? { userId: fallback.userId } : {}),
        projectId: fallback.projectId,
        productionId: fallback.productionId,
      }
    }
    return {
      scope: 'project',
      ...(fallback.userId ? { userId: fallback.userId } : {}),
      projectId: fallback.projectId,
    }
  }
  return {
    scope: 'global',
    ...(fallback.userId ? { userId: fallback.userId } : {}),
  }
}

function productionIdFromLocation(pathname: string, search: string): number | undefined {
  const queryValue = new URLSearchParams(search).get('productionId')
  const queryId = positiveInteger(queryValue)
  if (queryId !== undefined) return queryId
  const match = pathname.match(/(?:^|\/)production(?:s|Orchestration)?\/(\d+)(?:\/|$)/i)
  return positiveInteger(match?.[1])
}

function positiveInteger(value: unknown): number | undefined {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : undefined
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function workspaceRecordLabel(record: SemanticEntityRecord, fallback: string): string {
  return stringValue(record.name) ?? stringValue(record.title) ?? stringValue(record.label) ?? `${fallback} #${record.ID}`
}

function mergeCurrentProject(projects: Project[], currentProject: Project | null): Project[] {
  if (!currentProject || projects.some((project) => project.ID === currentProject.ID)) return projects
  return [currentProject, ...projects]
}
