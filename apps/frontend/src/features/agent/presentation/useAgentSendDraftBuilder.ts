import { useCallback } from 'react'
import { buildLocalAgentSendDraft, type AgentSendDraft } from '@/features/agent/application/agentSendDraft'
import { syncRuntimeModelConfig } from '@/shared/infrastructure/runtimeChat'
import { toastMCPError } from './mcpStatus'
import {
  isLocalAgentNotFoundError,
  localAgentClient,
  type AgentClientInput,
  type AgentManifest,
  type AgentRunPolicyOverride,
} from '@/shared/infrastructure/localAgentClient'
import { blobToDataURL, loadResourceFileBlob } from '@/shared/ui/resourceBlob'
import type { AgentAttachment, AgentSettings, ChatMessage } from '@/features/agent/state/agentStore'
import type { AgentPageTaskState } from '@/features/agent/state/agentSessionStore'
import type { Project, PublicModel } from '@/types'

export interface BuildAgentSendDraftOptions {
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
  performanceOperationId?: string
}

export interface UseAgentSendDraftBuilderInput {
  input: string
  attachments: AgentAttachment[]
  composerAttachments: AgentAttachment[]
  resourceAttachmentIndex: Map<number, AgentAttachment>
  settings: AgentSettings
  currentProject: Project | null
  conversationMessages: ChatMessage[]
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

export function useAgentSendDraftBuilder(input: UseAgentSendDraftBuilderInput) {
  return useCallback(async (options: BuildAgentSendDraftOptions = {}): Promise<AgentSendDraft> => {
    return buildLocalAgentSendDraft({
      options,
      draftInput: input.input,
      attachments: input.attachments,
      composerAttachments: input.composerAttachments,
      resourceAttachmentIndex: input.resourceAttachmentIndex,
      settings: input.settings,
      currentProject: input.currentProject,
      conversationMessages: input.conversationMessages,
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
      resolveAttachmentDataUrl,
    })
  }, [
    input.input,
    input.attachments,
    input.composerAttachments,
    input.resourceAttachmentIndex,
    input.settings,
    input.currentProject,
    input.conversationMessages,
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

async function resolveAttachmentDataUrl(attachment: AgentAttachment): Promise<string | undefined> {
  if (attachment.dataUrl) return attachment.dataUrl
  if (attachment.type !== 'image' || !attachment.resourceId) return undefined
  return blobToDataURL(await loadResourceFileBlob(attachment.resourceId))
}
