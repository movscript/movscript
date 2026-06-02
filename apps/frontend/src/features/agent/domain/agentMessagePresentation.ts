import { dedupeAttachments } from '@/features/agent/domain/agentAttachments'
import { isGeneratedResultAttachment } from '@/features/agent/domain/agentGeneratedResultAttachments'
import { isRuntimeEmptyAssistantPlaceholder, runtimeStatusMessageFromRunActivity, type RuntimeStatusMessage } from '@/features/agent/domain/agentRuntimeStatusMessage'
import { needsModelSetupAction } from '@/shared/domain/actionableErrors'
import type { AgentAttachment, ChatMessage } from '@/features/agent/state/agentStore'

type ChatMessageMeta = NonNullable<ChatMessage['meta']>

export interface AgentMessagePresentation {
  contextDiagnostic?: ChatMessageMeta['contextDiagnostic']
  contextLabels: string[]
  workspaceArtifacts: NonNullable<ChatMessageMeta['workspaceArtifacts']>
  isUser: boolean
  generationJobs: NonNullable<ChatMessageMeta['generationJobs']>
  generationParamAudits: NonNullable<ChatMessageMeta['generationParamAudits']>
  generationValidationErrors: NonNullable<ChatMessageMeta['generationValidationErrors']>
  localRunActivity?: ChatMessageMeta['localRunActivity']
  runtimeStatus?: RuntimeStatusMessage
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
}

export function buildAgentMessagePresentation(
  msg: ChatMessage,
): AgentMessagePresentation {
  const isUser = msg.role === 'user'
  const messageAttachments = dedupeAttachments(msg.attachments ?? [])
  const mediaAttachments = messageAttachments.filter((attachment) => attachment.type === 'image' || attachment.type === 'video')
  const generatedMediaAttachments = mediaAttachments.filter(isGeneratedResultAttachment)
  const nonGeneratedMediaAttachments = mediaAttachments.filter((attachment) => !isGeneratedResultAttachment(attachment))
  const otherAttachments = messageAttachments.filter((attachment) => attachment.type !== 'image' && attachment.type !== 'video')
  const showLargeMedia = !isUser && generatedMediaAttachments.length > 0
  const hasUsableGeneratedResource = generatedMediaAttachments.some((attachment) => attachment.resourceId !== undefined)
  const compactAttachments = showLargeMedia ? [...nonGeneratedMediaAttachments, ...otherAttachments] : messageAttachments
  const contextDiagnostic = !isUser ? msg.meta?.contextDiagnostic : undefined
  const workspaceArtifacts = !isUser ? msg.meta?.workspaceArtifacts ?? [] : []
  const generationJobs = !isUser ? msg.meta?.generationJobs ?? [] : []
  const generationParamAudits = !isUser ? msg.meta?.generationParamAudits ?? [] : []
  const generationValidationErrors = !isUser ? msg.meta?.generationValidationErrors ?? [] : []
  const localRunActivity = !isUser ? msg.meta?.localRunActivity : undefined
  const runtimeStatus = !isUser ? runtimeStatusMessageFromRunActivity({ runtimeStatus: msg.meta?.runtimeStatus, activity: localRunActivity, generationJobs }) : undefined
  const rawDisplayContent = contextDiagnostic
    ? ''
    : !isUser ? hideGeneratedResultTechnicalSummary(msg.content) : msg.content
  const visibleContent = !isUser ? hideFinalSourceSummary(rawDisplayContent) : rawDisplayContent
  const displayContent = !isUser && runtimeStatus && isRuntimeEmptyAssistantPlaceholder(visibleContent)
    ? ''
    : !isUser && localRunActivity && isRequiredActionSummaryContent(visibleContent, localRunActivity)
    ? ''
    : visibleContent
  const showModelSetupAction = !isUser && needsModelSetupAction(msg.content)
  const hasResultSection = !isUser && (
    showLargeMedia
    || compactAttachments.length > 0
    || workspaceArtifacts.length > 0
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
    contextLabels: visibleContextLabels(msg.meta?.contextLabels ?? [], isUser),
    workspaceArtifacts,
    isUser,
    generationJobs,
    generationParamAudits,
    generationValidationErrors,
    localRunActivity,
    runtimeStatus,
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
  }
}

export function hideGeneratedResultTechnicalSummary(text: string): string {
  const hiddenLine = /^(?:Command:\s*\/(?:image|video)\b.*|Run:\s*\S+|Thread:\s*\S+|Job\s+#\d+|Status:\s*\S+|Output resources?:\s*#?\d+(?:\s*,\s*#?\d+)*)\s*$/i
  return text
    .split('\n')
    .filter((line) => !hiddenLine.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function visibleContextLabels(labels: string[], isUser: boolean): string[] {
  void isUser
  return labels.filter((label) => {
    const normalized = label.trim()
    if (/^run\s+\S+$/i.test(normalized)) return false
    if (/^(?:已恢复本地\s*Runtime|Restored Local Runtime|Restored)$/i.test(normalized)) return false
    return true
  })
}

function isRequiredActionSummaryContent(content: string, activity: NonNullable<ChatMessageMeta['localRunActivity']>): boolean {
  if (activity.status !== 'requires_action') return false
  const lines = content.split('\n').map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) return false
  const approvalLines = (activity.approvals ?? [])
    .filter((approval) => approval.status === 'pending')
    .map((approval) => `- ${approval.toolName}: ${approval.reason}`)
  if (matchesSummaryLines(lines, approvalLines)) return true

  const inputLines = (activity.inputs ?? [])
    .filter((request) => request.status === 'pending')
    .map((request) => `- ${request.title}: ${request.question}`)
  return matchesSummaryLines(lines, inputLines)
}

function matchesSummaryLines(lines: string[], expectedItems: string[]): boolean {
  if (expectedItems.length === 0) return false
  if (lines.length !== expectedItems.length + 1) return false
  return expectedItems.every((item) => lines.includes(item))
}

function hideFinalSourceSummary(content: string): string {
  const lines = content.split('\n')
  let sourceStart = -1
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (/^\s*来源[:：]\s*$/.test(lines[index])) {
      sourceStart = index
      break
    }
  }
  if (sourceStart < 0) return content
  const sourceLines = lines.slice(sourceStart + 1).filter((line) => line.trim())
  if (sourceLines.length === 0) return content
  const allTechnicalSourceLines = sourceLines.every((line) => /^\s*-\s+/.test(line) && /source=/.test(line) && /evidence=/.test(line))
  if (!allTechnicalSourceLines) return content
  return lines.slice(0, sourceStart).join('\n').trimEnd()
}
