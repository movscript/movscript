import { useCallback } from 'react'
import { buildLocalAgentSendWorkspace, type AgentSendWorkspace } from '@/features/agent/application/agentSendWorkspace'
import { syncRuntimeModelConfig } from '@/shared/infrastructure/runtimeChat'
import { toastMCPError } from './mcpStatus'
import {
  isLocalAgentNotFoundError,
  localAgentClient,
  type AgentClientInput,
  type AgentManifest,
  type AgentRuntimeLimitsOverride,
} from '@/shared/infrastructure/localAgentClient'
import { resolveAgentAttachmentDataUrl } from '@/features/agent/application/agentAttachmentDataUrl'
import type { AgentAttachment, AgentSettings } from '@/features/agent/state/agentStore'
import type { AgentPageTaskState } from '@/features/agent/state/agentSessionStore'
import type { Project, PublicModel } from '@/types'

export interface BuildAgentSendWorkspaceOptions {
  includeRuntimePreview?: boolean
  message?: string
  displayMessage?: string
  title?: string
  projectId?: number
  clientInput?: AgentClientInput
  agentManifest?: AgentManifest
  runtimeLimits?: AgentRuntimeLimitsOverride
  requestId?: string
  timeoutMs?: number
  omitDebugArtifacts?: boolean
  performanceOperationId?: string
  localRuntimeWorkspaceDir?: string
  localRuntimeSessionId?: string
}

export interface UseAgentSendWorkspaceBuilderInput {
  input: string
  attachments: AgentAttachment[]
  composerAttachments: AgentAttachment[]
  resourceAttachmentIndex: Map<number, AgentAttachment>
  settings: AgentSettings
  currentProject: Project | null
  systemPrompt: string
  contextLabels: string[]
  localThreadId: string
  modelId: number | null
  activeModel?: PublicModel
  activeConversationManifest?: AgentManifest
  externalTask?: AgentPageTaskState | null
  pageToolRequestId?: string
  localRuntimeWorkspaceDir?: string
  localRuntimeSessionId?: string
  localAgentOnline: boolean
  mcpEndpoint?: string
  refetchLocalAgentHealth: () => Promise<unknown>
  labels: {
    attachmentOnlyMessage: string
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
}

export function useAgentSendWorkspaceBuilder(input: UseAgentSendWorkspaceBuilderInput) {
  return useCallback(async (options: BuildAgentSendWorkspaceOptions = {}): Promise<AgentSendWorkspace> => {
    const runtimeWorkspaceDir = options.localRuntimeWorkspaceDir ?? input.localRuntimeWorkspaceDir
    const runtimeSessionId = options.localRuntimeSessionId ?? input.localRuntimeSessionId
    const runtimeClient = runtimeSessionId?.trim()
      ? localAgentClient.forSession({
          sessionId: runtimeSessionId.trim(),
          ...(runtimeWorkspaceDir?.trim() ? { workspaceDir: runtimeWorkspaceDir.trim() } : {}),
        })
      : localAgentClient
    return buildLocalAgentSendWorkspace({
      options: {
        ...options,
        ...(runtimeWorkspaceDir?.trim() ? { localRuntimeWorkspaceDir: runtimeWorkspaceDir.trim() } : {}),
        ...(runtimeSessionId?.trim() ? { localRuntimeSessionId: runtimeSessionId.trim() } : {}),
      },
      workspaceInput: input.input,
      attachments: input.attachments,
      composerAttachments: input.composerAttachments,
      resourceAttachmentIndex: input.resourceAttachmentIndex,
      settings: input.settings,
      currentProject: input.currentProject,
      systemPrompt: input.systemPrompt,
      contextLabels: input.contextLabels,
      localThreadId: input.localThreadId,
      modelId: input.modelId,
      ...(input.activeModel ? { activeModel: input.activeModel } : {}),
      ...(input.activeConversationManifest ? { activeConversationManifest: input.activeConversationManifest } : {}),
      externalTask: input.externalTask,
      pageToolRequestId: input.pageToolRequestId,
      attachmentOnlyMessageLabel: input.labels.attachmentOnlyMessage,
      localAgentBaseURL: runtimeClient.baseURL,
      httpLabels: {
        syncModelConfig: input.labels.syncModelConfig,
        loadExistingThread: input.labels.loadExistingThread,
        missingThreadFallback: input.labels.missingThreadFallback,
        createThread: input.labels.createThread,
        appendUserMessage: input.labels.appendUserMessage,
        createRun: input.labels.createRun,
        pollRun: input.labels.pollRun,
        pollRunNote: input.labels.pollRunNote,
        fetchFinalThread: input.labels.fetchFinalThread,
      },
      previewDeps: {
        localAgentOnline: runtimeSessionId ? false : input.localAgentOnline,
        ensureRunning: () => runtimeClient.ensureRunning(),
        refetchLocalAgentHealth: input.refetchLocalAgentHealth,
        syncRuntimeModelConfig: (modelId) => syncRuntimeModelConfig(modelId, { client: runtimeClient }),
        previewRun: (clientInput) => runtimeClient.previewRun(clientInput),
        isLocalAgentNotFoundError,
        onPreviewError: (error) => toastMCPError(error, input.mcpEndpoint ?? runtimeClient.baseURL),
      },
      resolveAttachmentDataUrl: resolveAgentAttachmentDataUrl,
    })
  }, [
    input.input,
    input.attachments,
    input.composerAttachments,
    input.resourceAttachmentIndex,
    input.settings,
    input.currentProject,
    input.systemPrompt,
    input.contextLabels,
    input.localThreadId,
    input.modelId,
    input.activeModel,
    input.activeConversationManifest,
    input.externalTask,
    input.pageToolRequestId,
    input.localRuntimeWorkspaceDir,
    input.localRuntimeSessionId,
    input.localAgentOnline,
    input.mcpEndpoint,
    input.refetchLocalAgentHealth,
    input.labels,
  ])
}
