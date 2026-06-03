import { isAgentChatUiOnlyAssistantMessage, isAgentChatVisibleAssistantMessage } from '@movscript/protocol'
import type { ChatMessage } from '@/features/agent/state/agentStore'

export function isUiOnlyAssistantChatMessage(message: Pick<ChatMessage, 'role' | 'meta'>): boolean {
  return isAgentChatUiOnlyAssistantMessage(message)
}

export function isVisibleAssistantChatMessage(message: Pick<ChatMessage, 'role' | 'meta'>): boolean {
  return isAgentChatVisibleAssistantMessage(message)
}

export function isVisibleTranscriptChatMessage(message: Pick<ChatMessage, 'role' | 'meta'>): boolean {
  return !isUiOnlyAssistantChatMessage(message)
}

export function visibleAssistantRuntimeMessageRunId(message: Pick<ChatMessage, 'role' | 'meta'>): string | undefined {
  if (!isVisibleAssistantChatMessage(message)) return undefined
  return normalizeRunId(message.meta?.runtimeMessage?.runId)
}

export function visibleAssistantRelatedRunId(message: Pick<ChatMessage, 'role' | 'meta'>): string | undefined {
  if (!isVisibleAssistantChatMessage(message)) return undefined
  return normalizeRunId(message.meta?.runtimeMessage?.runId)
    ?? normalizeRunId(message.meta?.localRunActivity?.runId)
}

export function visibleAssistantActivityRunId(message: Pick<ChatMessage, 'role' | 'meta'>): string | undefined {
  if (!isVisibleAssistantChatMessage(message)) return undefined
  return normalizeRunId(message.meta?.localRunActivity?.runId)
}

export function visibleTranscriptChatMessages<T extends Pick<ChatMessage, 'role' | 'meta'>>(messages: T[]): T[] {
  return messages.filter(isVisibleTranscriptChatMessage)
}

export function latestVisibleTranscriptChatMessage<T extends Pick<ChatMessage, 'role' | 'meta'>>(messages: T[]): T | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message && isVisibleTranscriptChatMessage(message)) return message
  }
  return undefined
}

function normalizeRunId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
