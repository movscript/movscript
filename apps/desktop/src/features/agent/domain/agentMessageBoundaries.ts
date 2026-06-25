import type { ChatMessage, ChatRunActivity } from '@/features/agent/state/agentStore'
import { providerSessionInputRef, providerSessionMessageRef } from '@movscript/agent-protocol'

export function isTranscriptAssistantChatMessage(message: Pick<ChatMessage, 'role' | 'meta'>): boolean {
  return message.role === 'assistant'
}

export function transcriptAssistantProviderSessionRunId(message: Pick<ChatMessage, 'role' | 'meta'>): string | undefined {
  if (!isTranscriptAssistantChatMessage(message)) return undefined
  return normalizeRunId(providerSessionMessageRef(message)?.runId)
}

export function assistantMessageCompletesStreamingRun(message: Pick<ChatMessage, 'role' | 'meta'>, runId: string): boolean {
  return transcriptAssistantProviderSessionRunId(message) === normalizeRunId(runId)
}

export function streamingAssistantRunIdFromMessageId(messageId: string): string | undefined {
  return messageId.startsWith('stream-') ? normalizeRunId(messageId.slice('stream-'.length)) : undefined
}

export function visibleStreamingAssistantTextForTranscript(input: {
  transcriptMessages: Array<Pick<ChatMessage, 'role' | 'meta'>>
  streamingAssistantMessageId?: string | null
  streamingAssistantText: string
}): string {
  const streamingRunId = input.streamingAssistantMessageId
    ? streamingAssistantRunIdFromMessageId(input.streamingAssistantMessageId)
    : undefined
  if (!streamingRunId) return input.streamingAssistantText
  const hasFinalAssistantMessage = input.transcriptMessages.some((message) => assistantMessageCompletesStreamingRun(message, streamingRunId))
  return hasFinalAssistantMessage ? '' : input.streamingAssistantText
}

export function transcriptAssistantRelatedRunId(message: Pick<ChatMessage, 'role' | 'meta'>): string | undefined {
  if (!isTranscriptAssistantChatMessage(message)) return undefined
  return normalizeRunId(providerSessionMessageRef(message)?.runId)
}

export function transcriptUserRelatedRunId(message: Pick<ChatMessage, 'role' | 'meta'>): string | undefined {
  if (message.role !== 'user') return undefined
  return normalizeRunId(providerSessionInputRef(message)?.runId)
    ?? normalizeRunId(providerSessionMessageRef(message)?.runId)
}

export function transcriptMessageItemRelatedRunId(item: {
  message: Pick<ChatMessage, 'role' | 'meta'>
  timelineActivity?: Pick<ChatRunActivity, 'runId'>
}): string | undefined {
  return transcriptAssistantRelatedRunId(item.message)
    ?? normalizeRunId(item.timelineActivity?.runId)
}

export function transcriptMessageItemThreadRunId(item: {
  message: Pick<ChatMessage, 'role' | 'meta'>
  timelineActivity?: Pick<ChatRunActivity, 'runId'>
}): string | undefined {
  return transcriptUserRelatedRunId(item.message)
    ?? transcriptMessageItemRelatedRunId(item)
}

export function transcriptMessageCount(input: { transcriptMessageCount?: number; transcriptMessages: Array<Pick<ChatMessage, 'role' | 'meta'>> }): number {
  return typeof input.transcriptMessageCount === 'number' && Number.isFinite(input.transcriptMessageCount)
    ? Math.max(0, Math.floor(input.transcriptMessageCount))
    : input.transcriptMessages.length
}

export function latestTranscriptChatMessage<T extends Pick<ChatMessage, 'role' | 'meta'>>(input: { transcriptMessages: T[] }): T | undefined {
  return input.transcriptMessages.at(-1)
}

function normalizeRunId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
