import { dedupeAttachments } from '@/lib/agentAttachments'
import { isGeneratedResultAttachment } from '@/lib/agentGeneratedResultAttachments'
import { hideGeneratedResultTechnicalSummary, outputResourceIdsFromText } from '@/lib/agentMessageViewModel'
import { needsModelSetupAction } from '@/lib/actionableErrors'
import type { AgentAttachment, ChatMessage } from '@/store/agentStore'

type ChatMessageMeta = NonNullable<ChatMessage['meta']>

export interface AgentMessagePresentation {
  contextDiagnostic?: ChatMessageMeta['contextDiagnostic']
  contextLabels: string[]
  draftArtifacts: NonNullable<ChatMessageMeta['draftArtifacts']>
  isUser: boolean
  generationJobs: NonNullable<ChatMessageMeta['generationJobs']>
  generationParamAudits: NonNullable<ChatMessageMeta['generationParamAudits']>
  generationValidationErrors: NonNullable<ChatMessageMeta['generationValidationErrors']>
  localRunActivity?: ChatMessageMeta['localRunActivity']
  messageAttachments: AgentAttachment[]
  generatedMediaAttachments: AgentAttachment[]
  compactAttachments: AgentAttachment[]
  displayContent: string
  showModelSetupAction: boolean
  showLargeMedia: boolean
  hasUsableGeneratedResource: boolean
  hasResultSection: boolean
  hasProcessSection: boolean
  hasDiagnosticSection: boolean
  missingTextOutputResourceIds: number[]
}

export function buildAgentMessagePresentation(
  msg: ChatMessage,
  historicalGeneratedAttachments: AgentAttachment[] = [],
): AgentMessagePresentation {
  const isUser = msg.role === 'user'
  const textOutputResourceIds = outputResourceIdsFromText(msg.content)
  const existingResourceIds = new Set((msg.attachments ?? [])
    .map((attachment) => attachment.resourceId)
    .filter((id): id is number => id !== undefined))
  const missingTextOutputResourceIds = textOutputResourceIds.filter((id) => !existingResourceIds.has(id))
  const messageAttachments = dedupeAttachments([...(msg.attachments ?? []), ...historicalGeneratedAttachments])
  const mediaAttachments = messageAttachments.filter((attachment) => attachment.type === 'image' || attachment.type === 'video')
  const generatedMediaAttachments = mediaAttachments.filter(isGeneratedResultAttachment)
  const nonGeneratedMediaAttachments = mediaAttachments.filter((attachment) => !isGeneratedResultAttachment(attachment))
  const otherAttachments = messageAttachments.filter((attachment) => attachment.type !== 'image' && attachment.type !== 'video')
  const showLargeMedia = !isUser && generatedMediaAttachments.length > 0
  const hasUsableGeneratedResource = generatedMediaAttachments.some((attachment) => attachment.resourceId !== undefined)
  const compactAttachments = showLargeMedia ? [...nonGeneratedMediaAttachments, ...otherAttachments] : messageAttachments
  const contextDiagnostic = !isUser ? msg.meta?.contextDiagnostic : undefined
  const draftArtifacts = !isUser ? msg.meta?.draftArtifacts ?? [] : []
  const generationJobs = !isUser ? msg.meta?.generationJobs ?? [] : []
  const generationParamAudits = !isUser ? msg.meta?.generationParamAudits ?? [] : []
  const generationValidationErrors = !isUser ? msg.meta?.generationValidationErrors ?? [] : []
  const localRunActivity = !isUser ? msg.meta?.localRunActivity : undefined
  const displayContent = contextDiagnostic
    ? ''
    : showLargeMedia && hasUsableGeneratedResource ? hideGeneratedResultTechnicalSummary(msg.content) : msg.content
  const showModelSetupAction = !isUser && needsModelSetupAction(msg.content)
  const hasResultSection = !isUser && (
    showLargeMedia
    || compactAttachments.length > 0
    || draftArtifacts.length > 0
  )
  const hasProcessSection = !isUser && (
    !!localRunActivity
    || generationJobs.length > 0
  )
  const hasDiagnosticSection = !isUser && (
    !!contextDiagnostic
    || generationValidationErrors.length > 0
    || generationParamAudits.length > 0
  )
  return {
    contextDiagnostic,
    contextLabels: msg.meta?.contextLabels ?? [],
    draftArtifacts,
    isUser,
    generationJobs,
    generationParamAudits,
    generationValidationErrors,
    localRunActivity,
    messageAttachments,
    generatedMediaAttachments,
    compactAttachments,
    displayContent,
    showModelSetupAction,
    showLargeMedia,
    hasUsableGeneratedResource,
    hasResultSection,
    hasProcessSection,
    hasDiagnosticSection,
    missingTextOutputResourceIds,
  }
}
