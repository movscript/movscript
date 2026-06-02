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
  localAgentOnline: boolean
  mcpEndpoint?: string
  refetchLocalAgentHealth: () => Promise<unknown>
  assertMCPReady: () => Promise<unknown>
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
    return buildLocalAgentSendWorkspace({
      options,
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
      localAgentBaseURL: localAgentClient.baseURL,
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
        localAgentOnline: input.localAgentOnline,
        ensureRunning: () => localAgentClient.ensureRunning(),
        refetchLocalAgentHealth: input.refetchLocalAgentHealth,
        assertMCPReady: input.assertMCPReady,
        syncRuntimeModelConfig,
        previewRun: (clientInput) => localAgentClient.previewRun(clientInput),
        isLocalAgentNotFoundError,
        onPreviewError: (error) => toastMCPError(error, input.mcpEndpoint ?? localAgentClient.baseURL),
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
    input.localAgentOnline,
    input.mcpEndpoint,
    input.refetchLocalAgentHealth,
    input.assertMCPReady,
    input.labels,
  ])
}
