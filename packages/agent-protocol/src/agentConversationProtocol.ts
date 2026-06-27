import type { AgentAttachment, AgentTaskArtifactRef } from './agentAttachmentProtocol.js'
import type { MovScriptNormalizedFocus } from '@movscript/domain'
import type {
  AgentGenerationJob,
  AgentGenerationParamAudit,
  AgentGenerationValidationError,
} from './agentGenerationProtocol.js'
import type { ProviderSessionInputDeliveryStatus } from './providerSessionProtocol.js'

export interface AgentChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: AgentAttachment[]
  meta?: AgentChatMessageMeta
  timestamp: number
}

export interface AgentConversation {
  id: string
  title: string
  transcriptMessages: AgentChatMessage[]
  transcriptMessageCount?: number
  lastTranscriptAt?: number
  providerSessionId?: string
  providerThreadId?: string
  archived?: boolean
  createdAt: number
  updatedAt: number
}

export type AgentConversationWorkspaceScope = 'global' | 'project' | 'production'
export type AgentConversationWorkspaceRealmKind = 'local' | 'cloud'

export interface AgentConversationWorkspaceRealm {
  kind: AgentConversationWorkspaceRealmKind
  id: string
}

export interface AgentConversationWorkspaceContext {
  realm?: AgentConversationWorkspaceRealm
  realmKind?: AgentConversationWorkspaceRealmKind
  realmId?: string | number
  scope?: AgentConversationWorkspaceScope
  userId?: string | number
  orgId?: string | number
  projectId?: string | number
  projectUid?: string
  projectDir?: string
  projectTitle?: string
  productionId?: string | number
  domainFocus?: MovScriptNormalizedFocus
}

export interface AgentConversationWorkspace {
  input: string
  attachments: AgentAttachment[]
  workspaceContext?: AgentConversationWorkspaceContext
}

export interface ProviderSessionMessageRef {
  threadId: string
  messageId?: string
  runId?: string
}

export interface ProviderSessionInputRef {
  threadId?: string
  runId?: string
  messageId?: string
  deliveryStatus: ProviderSessionInputDeliveryStatus
  error?: string
}

export type ProviderSessionStatusLightState = 'stopped' | 'waiting' | 'active' | 'error'

export interface ProviderSessionAsyncWorkHandoffStatusMessage {
  kind: 'async_work_handoff'
  title: string
  detail: string
  workId?: string
  workKind?: string
  workStatus?: string
}

export interface ProviderSessionStatusLightMessage {
  kind: 'status_light'
  state: ProviderSessionStatusLightState
  label: string
  detail: string
}

export type ProviderSessionStatusMessage =
  | ProviderSessionAsyncWorkHandoffStatusMessage
  | ProviderSessionStatusLightMessage

export interface AgentChatMessageMeta {
  modelId?: string | null
  agentName?: string
  contextLabels?: string[]
  promptEligibility?: 'include' | 'exclude'
  localRunActivity?: Record<string, unknown>
  providerSessionMessage?: ProviderSessionMessageRef
  providerSessionInput?: ProviderSessionInputRef
  runtimeMessage?: ProviderSessionMessageRef
  runtimeInput?: ProviderSessionInputRef
  generationJobs?: AgentGenerationJob[]
  generationParamAudits?: AgentGenerationParamAudit[]
  generationValidationErrors?: AgentGenerationValidationError[]
  workspaceArtifacts?: AgentTaskArtifactRef[]
}

export function providerSessionMessageRef(message: { meta?: AgentChatMessageMeta }): ProviderSessionMessageRef | undefined {
  return message.meta?.providerSessionMessage ?? message.meta?.runtimeMessage
}

export function providerSessionInputRef(message: { meta?: AgentChatMessageMeta }): ProviderSessionInputRef | undefined {
  return message.meta?.providerSessionInput ?? message.meta?.runtimeInput
}

export interface AgentPendingActiveRunInputQueueItem {
  id: string
  runId?: string
  content: string
  timestamp: number
}

export function buildPendingActiveRunInputQueueItems(
  messages: Pick<AgentChatMessage, 'id' | 'role' | 'content' | 'timestamp' | 'meta'>[],
): AgentPendingActiveRunInputQueueItem[] {
  return messages
    .filter(activeRunInputIsWaitingForDelivery)
    .map((message) => {
      const providerSessionInput = providerSessionInputRef(message)
      return {
        id: message.id,
        ...(providerSessionInput?.runId?.trim() ? { runId: providerSessionInput.runId.trim() } : {}),
        content: message.content,
        timestamp: message.timestamp,
      }
    })
}

export function activeRunInputDisplayDeliveryStatus(
  message: { meta?: AgentChatMessageMeta },
): ProviderSessionInputDeliveryStatus | undefined {
  const providerSessionInput = providerSessionInputRef(message)
  if (!providerSessionInput) return undefined
  const providerSessionMessage = providerSessionMessageRef(message)
  if (
    providerSessionInput.deliveryStatus === 'pending'
    && (providerSessionInput.messageId?.trim() || providerSessionMessage?.messageId?.trim())
  ) {
    return 'accepted'
  }
  return providerSessionInput.deliveryStatus
}

export function activeRunInputIsWaitingForDelivery(
  message: Pick<AgentChatMessage, 'role' | 'meta'>,
): boolean {
  const providerSessionMessage = providerSessionMessageRef(message)
  return message.role === 'user'
    && activeRunInputDisplayDeliveryStatus(message) === 'pending'
    && !providerSessionMessage?.messageId
}

export function isAgentTranscriptExcludedAssistantMetadata(metadata: unknown): boolean {
  if (!isAgentMetadataRecord(metadata)) return false
  if (metadata.promptEligibility === 'exclude') return true
  return false
}

export function isAgentPromptExcludedAssistantMetadata(metadata: unknown): boolean {
  if (isAgentTranscriptExcludedAssistantMetadata(metadata)) return true
  if (!isAgentMetadataRecord(metadata)) return false
  if (isAgentMetadataRecord(metadata.localRunActivity)) return true
  return false
}

export function isAgentTranscriptExcludedAssistantMessage(message: { role: string; metadata?: unknown }): boolean {
  return message.role === 'assistant' && isAgentTranscriptExcludedAssistantMetadata(message.metadata)
}

export function isAgentTranscriptAssistantMessage(message: { role: string; metadata?: unknown }): boolean {
  return message.role === 'assistant' && !isAgentTranscriptExcludedAssistantMetadata(message.metadata)
}

export function isAgentPromptExcludedAssistantMessage(message: { role: string; metadata?: unknown }): boolean {
  return message.role === 'assistant' && isAgentPromptExcludedAssistantMetadata(message.metadata)
}

function isAgentMetadataRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
