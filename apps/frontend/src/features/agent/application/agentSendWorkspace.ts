import { dedupeAttachments } from '@/features/agent/domain/agentAttachments'
import { isDiagnosticAgentCommand, normalizeAgentCommandMessage } from '@/features/agent/domain/agentCommandInput'
import { publicModelId, publicModelLabel } from '@/shared/domain/modelDisplay'
import { type AgentAttachment, type AgentSettings } from '@/features/agent/state/agentStore'
import type { AgentPageTaskState } from '@/features/agent/state/agentSessionStore'
import type { Project, PublicModel, RawResource } from '@/types'
import type { ProviderSessionClientInput, ProviderManifest, ProviderSessionLimitsOverride, AgentRunPreview } from '@/shared/infrastructure/providerSessionClient'
import type { AgentRunProfileSelection } from '@/features/agent/domain/agentRunProfilePreset'
import type { AgentThreadControlState } from '@movscript/core/agent/chat'
import type { MovScriptWorkspaceContext } from '@/shared/infrastructure/providerConfigStore'
import {
  attachmentFromClientInputRef,
  attachmentPromptBlock,
  buildProviderSessionClientInput,
  resolveProviderSessionClientAttachmentRefs,
  resourceMentionAttachments,
} from '@/features/agent/application/agentSendWorkspaceAttachments'

export {
  attachmentFromClientInputRef,
  buildProviderSessionClientInput,
  resourceMentionAttachments,
} from '@/features/agent/application/agentSendWorkspaceAttachments'

export type AgentSendRoute = 'provider-session'

export interface AgentSendWorkspace {
  id: string
  createdAt: number
  performanceOperationId?: string
  route: AgentSendRoute
  visibleUserContent: string
  attachments: AgentAttachment[]
  model: {
    id: number | null
    name?: string
    providerModelId?: string
    provider?: string
  }
  agent: {
    id: number | null
    name?: string
    soul?: string
  }
  settings: Pick<AgentSettings, 'includeProjectContext' | 'includeRecentResources'>
  contextLabels: string[]
  context: {
    project?: Pick<Project, 'ID' | 'name' | 'description' | 'aspect_ratio' | 'visual_style' | 'project_style'>
    recentResources: Array<Pick<RawResource, 'ID' | 'name' | 'type' | 'mime_type' | 'size'>>
  }
  outbound: {
    systemPrompt: string
    agentContext: string
    enrichedUserContent: string
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  }
  httpRequests: DebugHttpRequest[]
  providerSession?: AgentSendProviderSessionScope
  runProfile?: AgentRunProfileSelection
  warnings: string[]
}

export interface AgentSendProviderSessionScope {
  workspaceDir?: string
  sessionId?: string
  threadId?: string
  title?: string
  projectId?: number
  clientInput?: ProviderSessionClientInput
  providerManifest?: ProviderManifest
  providerSessionLimits?: ProviderSessionLimitsOverride
  runProfile?: AgentRunProfileSelection
  threadControl?: Partial<AgentThreadControlState>
  requestId?: string
  timeoutMs?: number
  diagnosticCommand?: boolean
  preview?: AgentRunPreview
  previewError?: string
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

export interface AgentSendWorkspaceOptions {
  includeProviderSessionPreview?: boolean
  message?: string
  displayMessage?: string
  title?: string
  projectId?: number
  clientInput?: ProviderSessionClientInput
  providerManifest?: ProviderManifest
  providerSessionLimits?: ProviderSessionLimitsOverride
  runProfile?: AgentRunProfileSelection
  threadControl?: Partial<AgentThreadControlState>
  workspaceContext?: MovScriptWorkspaceContext
  requestId?: string
  timeoutMs?: number
  omitDebugArtifacts?: boolean
  performanceOperationId?: string
  providerSessionWorkspaceDir?: string
  providerSessionId?: string
}

export interface AgentSendWorkspaceHttpLabels {
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

export interface AgentSendWorkspacePreviewDeps {
  providerSessionOnline: boolean
  ensureRunning: () => Promise<unknown>
  refetchProviderSessionHealth: () => Promise<unknown>
  syncProviderSessionModelConfig: (modelId?: string) => Promise<unknown>
  previewRun: (input: {
    threadId?: string
    clientInput: ProviderSessionClientInput
    providerManifest?: ProviderManifest
    providerSessionLimits?: ProviderSessionLimitsOverride
    runProfile?: AgentRunProfileSelection
    threadControl?: Partial<AgentThreadControlState>
  }) => Promise<AgentRunPreview>
  isProviderSessionNotFoundError: (error: unknown) => boolean
  onPreviewError?: (error: unknown) => void
}

export interface BuildProviderSessionSendWorkspaceInput {
  options?: AgentSendWorkspaceOptions
  workspaceInput: string
  attachments: AgentAttachment[]
  composerAttachments: AgentAttachment[]
  resourceAttachmentIndex: Map<number, AgentAttachment>
  settings: AgentSettings
  currentProject: Project | null
  systemPrompt: string
  contextLabels: string[]
  providerThreadId?: string
  modelId: number | null
  activeModel?: PublicModel
  activeConversationManifest?: ProviderManifest
  externalTask?: AgentPageTaskState | null
  pageToolRequestId?: string
  attachmentOnlyMessageLabel: string
  providerSessionBaseURL: string
  httpLabels: AgentSendWorkspaceHttpLabels
  previewDeps?: AgentSendWorkspacePreviewDeps
  resolveAttachmentDataUrl?: (attachment: AgentAttachment) => Promise<string | undefined>
  now?: () => number
  makeId?: () => string
}

export async function buildProviderSessionSendWorkspace(input: BuildProviderSessionSendWorkspaceInput): Promise<AgentSendWorkspace> {
  const options = input.options ?? {}
  const canUseExternalTask = !!input.externalTask
    && !input.externalTask.settledAt
    && (input.externalTask.status === 'queued' || input.externalTask.status === 'claimed')
  const taskPayload = canUseExternalTask && !options.clientInput && options.message === undefined ? input.externalTask?.payload : undefined
  const providerSessionLimits = options.providerSessionLimits
  const runProfile = options.runProfile
  const threadControl = normalizeSendThreadControl(options.threadControl)
  const taskRequestId = canUseExternalTask ? input.pageToolRequestId : undefined
  const text = (options.message ?? input.workspaceInput).trim()
  const warnings: string[] = []
  const sentAttachments = dedupeAttachments([
    ...(options.message === undefined
      ? input.composerAttachments
      : (options.clientInput?.attachments?.length ? options.clientInput.attachments.map(attachmentFromClientInputRef) : input.attachments)),
    ...resourceMentionAttachments(text, input.resourceAttachmentIndex),
  ])
  const clientAttachmentRefs = await resolveProviderSessionClientAttachmentRefs(sentAttachments, input.resolveAttachmentDataUrl, (warning) => warnings.push(warning))
  const visibleText = (options.displayMessage ?? text).trim()
  const visibleUserContent = visibleText || input.attachmentOnlyMessageLabel
  const providerSessionMessage = options.clientInput?.message ?? normalizeAgentCommandMessage(visibleUserContent)
  const diagnosticCommand = isDiagnosticAgentCommand(providerSessionMessage)
  const requestedManifest = options.providerManifest ?? input.activeConversationManifest
  const providerSessionProjectId = resolveProviderSessionProjectId({
    explicitProjectId: options.projectId,
    taskProjectId: taskPayload?.projectId,
    workspaceContext: options.workspaceContext,
    fallbackProjectId: input.currentProject?.ID,
  })
  const contextProject = providerSessionProjectId !== undefined
    ? input.currentProject?.ID === providerSessionProjectId ? input.currentProject : null
    : options.workspaceContext === undefined ? input.currentProject : null
  const clientInput = options.clientInput
    ?? (taskPayload?.clientInput
      ? {
          ...taskPayload.clientInput,
          message: providerSessionMessage,
          ...(sentAttachments.length > 0
            ? {
                attachments: clientAttachmentRefs,
              }
            : {}),
        }
      : buildProviderSessionClientInput({
          message: providerSessionMessage,
          attachmentRefs: clientAttachmentRefs,
          projectId: providerSessionProjectId,
          labels: input.contextLabels,
        }))
  const agentContext = buildAgentContext({
    project: contextProject,
    includeProjectContext: input.settings.includeProjectContext,
  })
  const enrichedUserContent = `${visibleUserContent}${attachmentPromptBlock(sentAttachments)}`
  const messages = [
    { role: 'system' as const, content: [input.systemPrompt, agentContext].filter(Boolean).join('\n\n') },
    { role: 'user' as const, content: enrichedUserContent },
  ]
  const debugMessages = options.omitDebugArtifacts ? [] : messages
  const sessionId = options.providerSessionId?.trim() || undefined
  const threadId = sessionId ? undefined : input.providerThreadId || undefined
  const workspaceDir = options.providerSessionWorkspaceDir?.trim() || undefined
  const providerSession: AgentSendProviderSessionScope = {
    ...(workspaceDir ? { workspaceDir } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(threadId ? { threadId } : {}),
    ...(threadId && (options.title ?? taskPayload?.title) ? { title: options.title ?? taskPayload?.title } : {}),
    ...(providerSessionProjectId !== undefined ? { projectId: providerSessionProjectId } : {}),
    clientInput,
    ...(requestedManifest ? { providerManifest: requestedManifest } : {}),
    ...(providerSessionLimits ? { providerSessionLimits } : {}),
    ...(runProfile ? { runProfile } : {}),
    ...(threadControl ? { threadControl } : {}),
    ...((options.requestId ?? taskRequestId) ? { requestId: options.requestId ?? taskRequestId } : {}),
    ...((options.timeoutMs ?? taskPayload?.timeoutMs) ? { timeoutMs: options.timeoutMs ?? taskPayload?.timeoutMs } : {}),
    diagnosticCommand,
  }

  if (options.includeProviderSessionPreview && input.previewDeps) {
    try {
      if (!input.previewDeps.providerSessionOnline) {
        await input.previewDeps.ensureRunning()
        await input.previewDeps.refetchProviderSessionHealth()
      }
      await input.previewDeps.syncProviderSessionModelConfig(input.activeModel ? publicModelId(input.activeModel) : undefined)
      try {
        providerSession.preview = await input.previewDeps.previewRun({
          ...(threadId ? { threadId } : {}),
          clientInput,
          ...(requestedManifest ? { providerManifest: requestedManifest } : {}),
          ...(providerSessionLimits ? { providerSessionLimits } : {}),
          ...(runProfile ? { runProfile } : {}),
          ...(threadControl ? { threadControl } : {}),
        })
      } catch (error) {
        if (!threadId || !input.previewDeps.isProviderSessionNotFoundError(error)) throw error
        warnings.push('Saved runtime session thread was not found; retried preview as a new thread.')
        providerSession.preview = await input.previewDeps.previewRun({
          clientInput,
          ...(requestedManifest ? { providerManifest: requestedManifest } : {}),
          ...(providerSessionLimits ? { providerSessionLimits } : {}),
          ...(runProfile ? { runProfile } : {}),
          ...(threadControl ? { threadControl } : {}),
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      providerSession.previewError = message
      warnings.push(`Provider session dry-run failed: ${message}`)
      input.previewDeps.onPreviewError?.(error)
    }
  }

  return {
    id: input.makeId?.() ?? makeTraceId(),
    createdAt: input.now?.() ?? Date.now(),
    ...(options.performanceOperationId ? { performanceOperationId: options.performanceOperationId } : {}),
    route: 'provider-session',
    visibleUserContent,
    attachments: sentAttachments,
    model: {
      id: input.modelId,
      ...(input.activeModel ? { name: publicModelLabel(input.activeModel) } : {}),
      ...(input.activeModel ? { providerModelId: publicModelId(input.activeModel) } : {}),
    },
    agent: {
      id: null,
    },
    settings: {
      includeProjectContext: input.settings.includeProjectContext,
      includeRecentResources: input.settings.includeRecentResources,
    },
    contextLabels: input.contextLabels,
    context: {
      ...(compactProject(contextProject) ? { project: compactProject(contextProject) } : {}),
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
        baseURL: input.providerSessionBaseURL,
        modelId: input.modelId,
        ...(input.activeModel ? { modelName: publicModelId(input.activeModel) } : {}),
        messages,
        providerSession,
        labels: input.httpLabels,
      }),
    providerSession,
    ...(runProfile ? { runProfile } : {}),
    warnings,
  }
}

export function buildDebugHttpRequests(options: {
  baseURL: string
  modelId: number | null
  modelName?: string
  messages: AgentSendWorkspace['outbound']['messages']
  providerSession?: AgentSendProviderSessionScope
  labels: AgentSendWorkspaceHttpLabels
}): DebugHttpRequest[] {
  const requests: DebugHttpRequest[] = []
  if (options.modelName) {
    requests.push({
      id: 'provider-save-model-config',
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

  const sessionId = options.providerSession?.sessionId?.trim()
  if (sessionId) {
    requests.push(
      {
        id: 'provider-session-message-run',
        label: options.labels.createRun,
        method: 'POST',
        url: `${options.baseURL}/sessions/${encodeURIComponent(sessionId)}/runs`,
        headers: { 'Content-Type': 'application/json' },
        body: {
          message: options.providerSession?.clientInput?.message ?? options.messages.at(-1)?.content ?? '',
          ...(options.providerSession?.clientInput ? { clientInput: options.providerSession.clientInput } : {}),
          ...(options.providerSession?.runProfile ? { runProfile: options.providerSession.runProfile } : {}),
          ...(options.providerSession?.threadControl ? { threadControl: options.providerSession.threadControl } : {}),
        },
      },
      {
        id: 'provider-poll-run',
        label: options.labels.pollRun,
        method: 'GET',
        url: `${options.baseURL}/runs/{runId}`,
        note: options.labels.pollRunNote,
      },
    )
    return requests.map((request) => ({
      ...request,
      ...(request.body !== undefined ? { body: compactDebugValue(request.body) } : {}),
    }))
  }

  return requests.map((request) => ({
    ...request,
    ...(request.body !== undefined ? { body: compactDebugValue(request.body) } : {}),
  }))
}

function normalizeSendThreadControl(threadControl: Partial<AgentThreadControlState> | undefined): Partial<AgentThreadControlState> | undefined {
  if (!threadControl) return undefined
  const next: Partial<AgentThreadControlState> = {
    ...(threadControl.collaborationMode === 'plan' ? { collaborationMode: 'plan' as const } : {}),
    ...(threadControl.goal ? { goal: threadControl.goal } : {}),
  }
  return Object.keys(next).length > 0 ? next : undefined
}

function resolveProviderSessionProjectId(input: {
  explicitProjectId?: number
  taskProjectId?: number
  workspaceContext?: MovScriptWorkspaceContext
  fallbackProjectId?: number
}): number | undefined {
  if (input.explicitProjectId !== undefined) return input.explicitProjectId
  if (input.taskProjectId !== undefined) return input.taskProjectId
  if (input.workspaceContext?.scope === 'project') return positiveInteger(input.workspaceContext.projectId)
  if (input.workspaceContext) return undefined
  return input.fallbackProjectId
}

function buildAgentContext(options: {
  project: Project | null
  includeProjectContext: boolean
}) {
  const lines: string[] = []
  if (options.includeProjectContext && options.project) {
    lines.push(`[Current project] ${options.project.name}.`)
  }
  return lines.join('\n')
}

function positiveInteger(value: unknown): number | undefined {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : undefined
}

function compactProject(project: Project | null): AgentSendWorkspace['context']['project'] | undefined {
  if (!project) return undefined
  return {
    ID: project.ID,
    name: project.name,
    description: project.description,
    aspect_ratio: project.aspect_ratio,
    visual_style: project.visual_style,
    project_style: project.project_style,
  }
}

function compactDebugValue(value: unknown, maxChars = 4000): unknown {
  if (typeof value === 'string') {
    if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(value)) {
      return `[image data URL redacted: ${value.length} chars]`
    }
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
