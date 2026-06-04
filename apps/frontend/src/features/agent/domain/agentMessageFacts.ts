import { dedupeAttachments } from '@/features/agent/domain/agentAttachments'
import { isGeneratedResultAttachment } from '@/features/agent/domain/agentGeneratedResultAttachments'
import { hasRuntimeAsyncWorkHandoffActivity } from '@/features/agent/domain/agentRuntimeWorkHandoff'
import type { AgentAttachment, ChatMessage, ChatRunActivity } from '@/features/agent/state/agentStore'

type ChatMessageMeta = NonNullable<ChatMessage['meta']>

export interface AgentMessageFacts {
  contextLabels: string[]
  workspaceArtifacts: NonNullable<ChatMessageMeta['workspaceArtifacts']>
  isUser: boolean
  generationJobs: NonNullable<ChatMessageMeta['generationJobs']>
  generationParamAudits: NonNullable<ChatMessageMeta['generationParamAudits']>
  generationValidationErrors: NonNullable<ChatMessageMeta['generationValidationErrors']>
  timelineActivity?: ChatRunActivity
  messageAttachments: AgentAttachment[]
  generatedMediaAttachments: AgentAttachment[]
  displayContent: string
}

export function buildAgentMessageFacts(
  msg: ChatMessage,
  input: { timelineActivity?: ChatRunActivity } = {},
): AgentMessageFacts {
  const isUser = msg.role === 'user'
  const messageAttachments = dedupeAttachments(msg.attachments ?? [])
  const mediaAttachments = messageAttachments.filter((attachment) => attachment.type === 'image' || attachment.type === 'video')
  const generatedMediaAttachments = mediaAttachments.filter(isGeneratedResultAttachment)
  const workspaceArtifacts = !isUser ? msg.meta?.workspaceArtifacts ?? [] : []
  const generationJobs = !isUser ? msg.meta?.generationJobs ?? [] : []
  const generationParamAudits = !isUser ? msg.meta?.generationParamAudits ?? [] : []
  const generationValidationErrors = !isUser ? msg.meta?.generationValidationErrors ?? [] : []
  const timelineActivity = !isUser ? input.timelineActivity : undefined
  const hasRuntimeWorkHandoff = !isUser ? hasRuntimeAsyncWorkHandoffActivity({ activity: timelineActivity }) : false
  const rawDisplayContent = !isUser ? hideGeneratedResultTechnicalSummary(msg.content) : msg.content
  const visibleContent = !isUser ? hideFinalSourceSummary(rawDisplayContent) : rawDisplayContent
  const displayContent = !isUser && hasRuntimeWorkHandoff && isRuntimeEmptyAssistantPlaceholder(visibleContent)
    ? ''
    : !isUser && timelineActivity && isRequiredActionSummaryContent(visibleContent, timelineActivity)
    ? ''
    : visibleContent
  return {
    contextLabels: visibleContextLabels(msg.meta?.contextLabels ?? [], isUser),
    workspaceArtifacts,
    isUser,
    generationJobs,
    generationParamAudits,
    generationValidationErrors,
    timelineActivity,
    messageAttachments,
    generatedMediaAttachments,
    displayContent,
  }
}

function isRuntimeEmptyAssistantPlaceholder(content: string): boolean {
  const normalized = content.trim()
  return normalized === ''
    || normalized === '（无内容）'
    || normalized === '本地 Agent Runtime 没有返回 assistant 消息。'
    || normalized === 'The local Agent runtime did not return an assistant message.'
}

function hideGeneratedResultTechnicalSummary(text: string): string {
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

function isRequiredActionSummaryContent(content: string, activity: ChatRunActivity): boolean {
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
