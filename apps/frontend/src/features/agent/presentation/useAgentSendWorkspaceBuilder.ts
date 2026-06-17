import { useCallback } from 'react'
import { buildProviderSessionSendWorkspace, type AgentSendWorkspace } from '@/features/agent/application/agentSendWorkspace'
import { syncProviderSessionModelConfig } from '@/shared/infrastructure/providerSessionChat'
import { toastMCPError } from './mcpStatus'
import {
  isProviderSessionNotFoundError,
  providerSessionClient,
  type ProviderSessionClientInput,
  type ProviderManifest,
  type ProviderSessionLimitsOverride,
} from '@/shared/infrastructure/providerSessionClient'
import { resolveAgentAttachmentDataUrl } from '@/features/agent/application/agentAttachmentDataUrl'
import type { AgentAttachment, AgentSettings } from '@/features/agent/state/agentStore'
import type { AgentRunProfileSelection } from '@/features/agent/domain/agentRunProfilePreset'
import type { AgentThreadControlState } from '@movscript/core/agent/chat'
import type { AgentPageTaskState } from '@/features/agent/state/agentSessionStore'
import type { MovScriptWorkspaceContext } from '@/shared/infrastructure/providerConfigStore'
import type { Project, PublicModel } from '@/types'

export interface BuildAgentSendWorkspaceOptions {
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

export interface UseAgentSendWorkspaceBuilderInput {
  input: string
  getInput?: () => string
  attachments: AgentAttachment[]
  composerAttachments: AgentAttachment[]
  resourceAttachmentIndex: Map<number, AgentAttachment>
  settings: AgentSettings
  currentProject: Project | null
  systemPrompt: string
  contextLabels: string[]
  providerThreadId: string
  modelId: string | null
  activeModel?: PublicModel
  activeConversationManifest?: ProviderManifest
  externalTask?: AgentPageTaskState | null
  pageToolRequestId?: string
  providerSessionWorkspaceDir?: string
  providerSessionId?: string
  providerSessionOnline: boolean
  mcpEndpoint?: string
  refetchProviderSessionHealth: () => Promise<unknown>
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
    const providerSessionWorkspaceDir = options.providerSessionWorkspaceDir ?? input.providerSessionWorkspaceDir
    const providerSessionId = options.providerSessionId ?? input.providerSessionId
    const providerSessionRunClient = providerSessionId?.trim()
      ? providerSessionClient.forSession({
          sessionId: providerSessionId.trim(),
          ...(providerSessionWorkspaceDir?.trim() ? { workspaceDir: providerSessionWorkspaceDir.trim() } : {}),
      })
      : providerSessionClient
    return buildProviderSessionSendWorkspace({
      options: {
        ...options,
        ...(providerSessionWorkspaceDir?.trim() ? { providerSessionWorkspaceDir: providerSessionWorkspaceDir.trim() } : {}),
        ...(providerSessionId?.trim() ? { providerSessionId: providerSessionId.trim() } : {}),
      },
      workspaceInput: input.getInput?.() ?? input.input,
      attachments: input.attachments,
      composerAttachments: input.composerAttachments,
      resourceAttachmentIndex: input.resourceAttachmentIndex,
      settings: input.settings,
      currentProject: input.currentProject,
      systemPrompt: input.systemPrompt,
      contextLabels: input.contextLabels,
      providerThreadId: input.providerThreadId,
      modelId: input.modelId,
      ...(input.activeModel ? { activeModel: input.activeModel } : {}),
      ...(input.activeConversationManifest ? { activeConversationManifest: input.activeConversationManifest } : {}),
      externalTask: input.externalTask,
      pageToolRequestId: input.pageToolRequestId,
      attachmentOnlyMessageLabel: input.labels.attachmentOnlyMessage,
      providerSessionBaseURL: providerSessionRunClient.baseURL,
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
        providerSessionOnline: providerSessionId ? false : input.providerSessionOnline,
        ensureRunning: () => providerSessionRunClient.ensureRunning(),
        refetchProviderSessionHealth: input.refetchProviderSessionHealth,
        syncProviderSessionModelConfig: (modelId) => syncProviderSessionModelConfig(modelId, { client: providerSessionRunClient }),
        previewRun: (clientInput) => providerSessionRunClient.previewRun(clientInput),
        isProviderSessionNotFoundError,
        onPreviewError: (error) => toastMCPError(error, input.mcpEndpoint ?? providerSessionRunClient.baseURL),
      },
      resolveAttachmentDataUrl: resolveAgentAttachmentDataUrl,
    })
  }, [
    input.input,
    input.getInput,
    input.attachments,
    input.composerAttachments,
    input.resourceAttachmentIndex,
    input.settings,
    input.currentProject,
    input.systemPrompt,
    input.contextLabels,
    input.providerThreadId,
    input.modelId,
    input.activeModel,
    input.activeConversationManifest,
    input.externalTask,
    input.pageToolRequestId,
    input.providerSessionWorkspaceDir,
    input.providerSessionId,
    input.providerSessionOnline,
    input.mcpEndpoint,
    input.refetchProviderSessionHealth,
    input.labels,
  ])
}
