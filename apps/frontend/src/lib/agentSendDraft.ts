import { attachmentKey, dedupeAttachments, placeholderAttachment } from '@/lib/agentAttachments'
import { buildCommandFirstClientInput, isDiagnosticAgentCommand, normalizeAgentCommandMessage } from '@/lib/agentCommandInput'
import { publicModelId, publicModelLabel } from '@/lib/modelDisplay'
import { activeRunPresetFromSettings, type AgentAttachment, type AgentPermissionMode, type AgentSettings, type ChatMessage } from '@/store/agentStore'
import type { AgentPageTaskState } from '@/store/agentSessionStore'
import type { Project, PublicModel, RawResource } from '@/types'
import type { AgentClientInput, AgentManifest, AgentRunPolicy, AgentRunPolicyOverride, AgentRunPreview } from './localAgentClient'

export type AgentSendRoute = 'local-runtime'

export interface AgentSendDraft {
  id: string
  createdAt: number
  route: AgentSendRoute
  visibleUserContent: string
  attachments: AgentAttachment[]
  model: {
    id: number | null
    name?: string
    runtimeModelId?: string
    provider?: string
  }
  agent: {
    id: number | null
    name?: string
    soul?: string
  }
  settings: Pick<AgentSettings, 'permissionMode' | 'includeProjectContext' | 'includeRecentResources' | 'autoPlan'>
  contextLabels: string[]
  context: {
    project?: Pick<Project, 'ID' | 'name' | 'status' | 'description' | 'aspect_ratio' | 'visual_style' | 'project_style'>
    recentResources: Array<Pick<RawResource, 'ID' | 'name' | 'type' | 'mime_type' | 'size'>>
  }
  outbound: {
    systemPrompt: string
    agentContext: string
    enrichedUserContent: string
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  }
  httpRequests: DebugHttpRequest[]
  localRuntime?: {
    threadId?: string
    title?: string
    projectId?: number
    clientInput?: AgentClientInput
    agentManifest?: AgentManifest
    runPolicy?: AgentRunPolicyOverride
    requestId?: string
    timeoutMs?: number
    diagnosticCommand?: boolean
    preview?: AgentRunPreview
    previewError?: string
  }
  warnings: string[]
}

export interface DebugHttpRequest {
  id: string
  label: string
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  url: string
  headers?: Record<string, string>
  body?: unknown
  note?: string
  conditional?: boolean
}

export interface AgentSendDraftOptions {
  includeRuntimePreview?: boolean
  message?: string
  displayMessage?: string
  title?: string
  projectId?: number
  clientInput?: AgentClientInput
  agentManifest?: AgentManifest
  runPolicy?: AgentRunPolicyOverride
  requestId?: string
  timeoutMs?: number
  omitDebugArtifacts?: boolean
}

export interface AgentSendDraftHttpLabels {
  syncModelConfig: string
  loadExistingThread: string
  missingThreadFallback: string
  createThread: string
  appendUserMessage: string
  createRun: string
  pollRun: string
  pollRunNote: string
  fetchFinalThread: string
}

export interface AgentSendDraftPreviewDeps {
  localAgentOnline: boolean
  ensureRunning: () => Promise<unknown>
  refetchLocalAgentHealth: () => Promise<unknown>
  assertMCPReady: () => Promise<unknown>
  syncRuntimeModelConfig: (modelId?: string) => Promise<unknown>
  previewRun: (input: {
    threadId?: string
    clientInput: AgentClientInput
    agentManifest?: AgentManifest
    policy?: AgentRunPolicyOverride
  }) => Promise<AgentRunPreview>
  isLocalAgentNotFoundError: (error: unknown) => boolean
  onPreviewError?: (error: unknown) => void
}

export interface BuildLocalAgentSendDraftInput {
  options?: AgentSendDraftOptions
  draftInput: string
  attachments: AgentAttachment[]
  composerAttachments: AgentAttachment[]
  resourceAttachmentIndex: Map<number, AgentAttachment>
  settings: AgentSettings
  currentProject: Project | null
  conversationMessages: ChatMessage[]
  systemPrompt: string
  contextLabels: string[]
  localThreadId?: string
  modelId: number | null
  activeModel?: PublicModel
  activeConversationManifest?: AgentManifest
  externalTask?: AgentPageTaskState | null
  pageToolRequestId?: string
  attachmentOnlyMessageLabel: string
  localAgentBaseURL: string
  httpLabels: AgentSendDraftHttpLabels
  previewDeps?: AgentSendDraftPreviewDeps
  now?: () => number
  makeId?: () => string
}

export async function buildLocalAgentSendDraft(input: BuildLocalAgentSendDraftInput): Promise<AgentSendDraft> {
  const options = input.options ?? {}
  const canUseExternalTask = !!input.externalTask
    && !input.externalTask.settledAt
    && (input.externalTask.status === 'queued' || input.externalTask.status === 'claimed')
  const taskPayload = canUseExternalTask && !options.clientInput && options.message === undefined ? input.externalTask?.payload : undefined
  const activeRunPreset = activeRunPresetFromSettings(input.settings)
  const presetRunPolicy: AgentRunPolicyOverride = {
    approvalMode: agentPermissionModeToApprovalMode(input.settings.permissionMode),
    maxToolCalls: activeRunPreset.maxToolCalls,
    maxIterations: activeRunPreset.maxIterations,
  }
  const effectiveRunPolicy: AgentRunPolicyOverride = {
    ...presetRunPolicy,
    ...(options.runPolicy ?? {}),
  }
  const taskRequestId = canUseExternalTask ? input.pageToolRequestId : undefined
  const text = (options.message ?? input.draftInput).trim()
  const sentAttachments = options.message === undefined
    ? input.composerAttachments
    : dedupeAttachments([
      ...(options.clientInput?.attachments?.length ? options.clientInput.attachments.map(attachmentFromClientInputRef) : input.attachments),
      ...resourceMentionAttachments(text, input.resourceAttachmentIndex),
    ])
  const visibleText = (options.displayMessage ?? text).trim()
  const visibleUserContent = visibleText || input.attachmentOnlyMessageLabel
  const runtimeMessage = options.clientInput?.message ?? normalizeAgentCommandMessage(visibleUserContent)
  const diagnosticCommand = isDiagnosticAgentCommand(runtimeMessage)
  const requestedManifest = options.agentManifest ?? input.activeConversationManifest
  const clientInput = options.clientInput
    ?? (taskPayload?.clientInput
      ? {
          ...taskPayload.clientInput,
          message: runtimeMessage,
          ...(sentAttachments.length > 0
            ? {
                attachments: sentAttachments.map(agentAttachmentToClientInputRef),
              }
            : {}),
        }
      : buildAgentClientInput({
          message: runtimeMessage,
          attachments: sentAttachments,
          projectId: options.projectId ?? input.currentProject?.ID,
          labels: input.contextLabels,
        }))
  const agentContext = buildAgentContext({
    permissionMode: input.settings.permissionMode,
    autoPlan: input.settings.autoPlan,
    project: input.currentProject,
    includeProjectContext: input.settings.includeProjectContext,
  })
  const enrichedUserContent = `${visibleUserContent}${attachmentPromptBlock(sentAttachments)}`
  const messages = [
    { role: 'system' as const, content: [input.systemPrompt, agentContext].filter(Boolean).join('\n\n') },
    ...input.conversationMessages.map((message) => ({ role: message.role, content: message.content })),
    { role: 'user' as const, content: enrichedUserContent },
  ]
  const debugMessages = options.omitDebugArtifacts ? [] : messages
  const warnings: string[] = []
  const threadId = diagnosticCommand ? undefined : input.localThreadId || undefined
  const localRuntimeProjectId = options.projectId ?? taskPayload?.projectId ?? input.currentProject?.ID
  const localRuntime: AgentSendDraft['localRuntime'] = {
    ...(threadId ? { threadId } : {}),
    ...(threadId && (options.title ?? taskPayload?.title) ? { title: options.title ?? taskPayload?.title } : {}),
    ...(localRuntimeProjectId !== undefined ? { projectId: localRuntimeProjectId } : {}),
    clientInput,
    ...(requestedManifest ? { agentManifest: requestedManifest } : {}),
    ...(effectiveRunPolicy ? { runPolicy: effectiveRunPolicy } : {}),
    ...((options.requestId ?? taskRequestId) ? { requestId: options.requestId ?? taskRequestId } : {}),
    ...((options.timeoutMs ?? taskPayload?.timeoutMs) ? { timeoutMs: options.timeoutMs ?? taskPayload?.timeoutMs } : {}),
    diagnosticCommand,
  }

  if (options.includeRuntimePreview && input.previewDeps) {
    try {
      if (!input.previewDeps.localAgentOnline) {
        await input.previewDeps.ensureRunning()
        await input.previewDeps.refetchLocalAgentHealth()
      }
      await input.previewDeps.assertMCPReady()
      await input.previewDeps.syncRuntimeModelConfig(input.activeModel ? publicModelId(input.activeModel) : undefined)
      try {
        localRuntime.preview = await input.previewDeps.previewRun({
          ...(threadId ? { threadId } : {}),
          clientInput,
          ...(requestedManifest ? { agentManifest: requestedManifest } : {}),
          ...(effectiveRunPolicy ? { policy: effectiveRunPolicy } : {}),
        })
      } catch (error) {
        if (!threadId || !input.previewDeps.isLocalAgentNotFoundError(error)) throw error
        warnings.push('Saved local thread was not found; retried preview as a new thread.')
        localRuntime.preview = await input.previewDeps.previewRun({
          clientInput,
          ...(requestedManifest ? { agentManifest: requestedManifest } : {}),
          ...(effectiveRunPolicy ? { policy: effectiveRunPolicy } : {}),
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      localRuntime.previewError = message
      warnings.push(`Local runtime dry-run failed: ${message}`)
      input.previewDeps.onPreviewError?.(error)
    }
  }

  return {
    id: input.makeId?.() ?? makeTraceId(),
    createdAt: input.now?.() ?? Date.now(),
    route: 'local-runtime',
    visibleUserContent,
    attachments: sentAttachments,
    model: {
      id: input.modelId,
      ...(input.activeModel ? { name: publicModelLabel(input.activeModel) } : {}),
      ...(input.activeModel ? { runtimeModelId: publicModelId(input.activeModel) } : {}),
    },
    agent: {
      id: null,
    },
    settings: {
      permissionMode: input.settings.permissionMode,
      includeProjectContext: input.settings.includeProjectContext,
      includeRecentResources: input.settings.includeRecentResources,
      autoPlan: input.settings.autoPlan,
    },
    contextLabels: input.contextLabels,
    context: {
      ...(compactProject(input.currentProject) ? { project: compactProject(input.currentProject) } : {}),
      recentResources: [],
    },
    outbound: {
      systemPrompt: input.systemPrompt,
      agentContext,
      enrichedUserContent,
      messages: debugMessages,
    },
    httpRequests: options.omitDebugArtifacts
      ? []
      : buildDebugHttpRequests({
        baseURL: input.localAgentBaseURL,
        modelId: input.modelId,
        ...(input.activeModel ? { modelName: publicModelId(input.activeModel) } : {}),
        messages,
        localRuntime,
        labels: input.httpLabels,
      }),
    localRuntime,
    warnings,
  }
}

export function attachmentFromClientInputRef(attachment: NonNullable<AgentClientInput['attachments']>[number]): AgentAttachment {
  const type = attachment.type === 'image' || attachment.type === 'video' || attachment.type === 'audio' || attachment.type === 'text'
    ? attachment.type
    : 'file'
  return {
    id: attachment.id ?? (attachment.resourceId !== undefined ? `res-${attachment.resourceId}` : `${attachment.name ?? 'attachment'}-${Math.random().toString(36).slice(2, 8)}`),
    name: attachment.name ?? `resource-${attachment.resourceId ?? 'attachment'}`,
    type,
    mimeType: attachment.mimeType ?? 'application/octet-stream',
    size: attachment.size ?? 0,
    ...(attachment.resourceId !== undefined ? { resourceId: attachment.resourceId } : {}),
  }
}

export function resourceMentionAttachments(text: string, byId: Map<number, AgentAttachment>): AgentAttachment[] {
  return parseResourceMentionIds(text).map((resourceId) => byId.get(resourceId) ?? placeholderAttachment(resourceId))
}

export function buildAgentClientInput(options: {
  message: string
  attachments: AgentAttachment[]
  projectId?: number
  labels?: string[]
  route?: { pathname?: string; search?: string; hash?: string }
  productionId?: number
  draftId?: string
  selection?: { entityType?: string; entityId?: number | string; label?: string } | null
}): AgentClientInput {
  return buildCommandFirstClientInput({
    message: options.message,
    attachments: options.attachments.map(agentAttachmentToClientInputRef),
    labels: options.labels,
    hints: {
      ...(options.projectId ? { projectId: options.projectId } : {}),
      ...(options.productionId ? { productionId: options.productionId } : {}),
      ...(options.draftId ? { draftId: options.draftId } : {}),
      ...(options.selection ? { selection: options.selection } : {}),
      ...(options.route ? { route: options.route } : {}),
    },
  })
}

export function buildDebugHttpRequests(options: {
  baseURL: string
  modelId: number | null
  modelName?: string
  messages: AgentSendDraft['outbound']['messages']
  localRuntime?: AgentSendDraft['localRuntime']
  labels: AgentSendDraftHttpLabels
}): DebugHttpRequest[] {
  const requests: DebugHttpRequest[] = []
  if (options.modelName) {
    requests.push({
      id: 'local-save-model-config',
      label: options.labels.syncModelConfig,
      method: 'POST',
      url: `${options.baseURL}/model-config`,
      headers: { 'Content-Type': 'application/json' },
      body: {
        model: options.modelName,
        useForChat: true,
        useForPlanner: true,
      },
    })
  }

  const threadId = options.localRuntime?.threadId
  const resolvedThreadId = threadId ?? '{threadId from POST /threads}'
  const threadRequests: DebugHttpRequest[] = threadId
    ? [{
      id: 'local-get-thread',
      label: options.labels.loadExistingThread,
      method: 'GET',
      url: `${options.baseURL}/threads/${encodeURIComponent(threadId)}`,
      note: options.labels.missingThreadFallback,
    }]
    : [{
      id: 'local-create-thread',
      label: options.labels.createThread,
      method: 'POST',
      url: `${options.baseURL}/threads`,
      headers: { 'Content-Type': 'application/json' },
      body: {
        title: options.localRuntime?.title,
      },
    }]

  requests.push(
    ...threadRequests,
    {
      id: 'local-add-message',
      label: options.labels.appendUserMessage,
      method: 'POST',
      url: `${options.baseURL}/threads/${resolvedThreadId}/messages`,
      headers: { 'Content-Type': 'application/json' },
      body: {
        role: 'user',
        content: options.localRuntime?.clientInput?.message ?? options.messages.at(-1)?.content ?? '',
        ...(options.localRuntime?.clientInput ? { clientInput: options.localRuntime.clientInput } : {}),
      },
    },
    {
      id: 'local-create-run',
      label: options.labels.createRun,
      method: 'POST',
      url: `${options.baseURL}/runs`,
      headers: { 'Content-Type': 'application/json' },
      body: {
        threadId: resolvedThreadId,
        ...(options.localRuntime?.clientInput ? { clientInput: options.localRuntime.clientInput } : {}),
      },
    },
    {
      id: 'local-poll-run',
      label: options.labels.pollRun,
      method: 'GET',
      url: `${options.baseURL}/runs/{runId}`,
      note: options.labels.pollRunNote,
    },
    {
      id: 'local-final-thread',
      label: options.labels.fetchFinalThread,
      method: 'GET',
      url: `${options.baseURL}/threads/${resolvedThreadId}`,
    },
  )
  return requests.map((request) => ({
    ...request,
    ...(request.body !== undefined ? { body: compactDebugValue(request.body) } : {}),
  }))
}

export function agentPermissionModeToApprovalMode(permissionMode: AgentPermissionMode): AgentRunPolicy['approvalMode'] {
  if (permissionMode === 'auto') return 'auto'
  if (permissionMode === 'suggest') return 'auto_readonly'
  return 'interactive'
}

function buildAgentContext(options: {
  permissionMode: AgentPermissionMode
  autoPlan: boolean
  project: Project | null
  includeProjectContext: boolean
}) {
  void options
  return ''
}

function compactProject(project: Project | null): AgentSendDraft['context']['project'] | undefined {
  if (!project) return undefined
  return {
    ID: project.ID,
    name: project.name,
    status: project.status,
    description: project.description,
    aspect_ratio: project.aspect_ratio,
    visual_style: project.visual_style,
    project_style: project.project_style,
  }
}

function attachmentPromptBlock(attachments: AgentAttachment[]) {
  if (attachments.length === 0) return ''
  const lines = attachments.map((attachment, index) => {
    const id = attachment.resourceId ? `resource_id=${attachment.resourceId}` : 'local_preview'
    return `${index + 1}. ${attachment.name} (${attachment.type}, ${attachment.mimeType || 'unknown'}, ${formatBytesForPrompt(attachment.size)}, ${id})`
  })
  return `\n\n[用户随消息提供的附件]\n${lines.join('\n')}\n请在回答时引用附件名称；当前文本接口只能读取这些附件元数据，不能直接解析二进制内容。`
}

function parseResourceMentionIds(text: string): number[] {
  const ids: number[] = []
  const seen = new Set<number>()
  for (const match of text.matchAll(/@\[resource:(\d+)\]/g)) {
    const id = Number(match[1])
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

function agentAttachmentToClientInputRef(attachment: AgentAttachment): NonNullable<AgentClientInput['attachments']>[number] {
  return {
    id: attachment.id,
    name: attachment.name,
    type: attachment.type,
    mimeType: attachment.mimeType,
    size: attachment.size,
    ...(attachment.resourceId ? { resourceId: attachment.resourceId } : {}),
  }
}

function compactDebugValue(value: unknown, maxChars = 4000): unknown {
  if (typeof value === 'string') {
    if (value.length <= maxChars) return value
    return `${value.slice(0, maxChars)}\n...[truncated ${value.length - maxChars} chars for debug preview]`
  }
  if (Array.isArray(value)) return value.map((item) => compactDebugValue(item, maxChars))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, compactDebugValue(item, maxChars)]),
    )
  }
  return value
}

function makeTraceId() {
  return `trace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function formatBytesForPrompt(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}
