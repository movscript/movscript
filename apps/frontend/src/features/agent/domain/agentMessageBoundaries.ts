import type { ChatMessage } from '@/features/agent/state/agentStore'

export function isTranscriptAssistantChatMessage(message: Pick<ChatMessage, 'role' | 'meta'>): boolean {
  return message.role === 'assistant'
}

export function transcriptAssistantRuntimeMessageRunId(message: Pick<ChatMessage, 'role' | 'meta'>): string | undefined {
  if (!isTranscriptAssistantChatMessage(message)) return undefined
  return normalizeRunId(message.meta?.runtimeMessage?.runId)
}

export function transcriptAssistantRelatedRunId(message: Pick<ChatMessage, 'role' | 'meta'>): string | undefined {
  if (!isTranscriptAssistantChatMessage(message)) return undefined
  return normalizeRunId(message.meta?.runtimeMessage?.runId)
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
