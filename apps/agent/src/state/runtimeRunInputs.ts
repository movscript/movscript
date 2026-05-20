import { cloneJSONValue, isJSONRecord } from '../jsonValue.js'
import type { AgentMessage, AgentRun, JSONValue } from './types.js'

const RUNTIME_INPUT_KIND = 'runtime_input'
const CONSUMED_RUNTIME_INPUT_IDS_KEY = 'consumedRuntimeInputMessageIds'

export function buildRuntimeInputMessageMetadata(input: {
  targetRunId: string
  mode?: unknown
}): Record<string, JSONValue> {
  return {
    kind: RUNTIME_INPUT_KIND,
    targetRunId: input.targetRunId,
    mode: input.mode === 'hard' ? 'hard' : 'soft',
    status: 'accepted',
  }
}

export function collectPendingRuntimeInputMessages(input: {
  run: AgentRun
  threadMessages: AgentMessage[]
}): AgentMessage[] {
  const consumed = new Set(runtimeInputConsumedMessageIds(input.run))
  return input.threadMessages
    .filter((message) => message.role === 'user')
    .filter((message) => !consumed.has(message.id))
    .filter((message) => isRuntimeInputMessageForRun(message, input.run.id))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export function appendRuntimeInputMessagesToUserMessage(baseUserMessage: string, messages: AgentMessage[]): string {
  if (messages.length === 0) return baseUserMessage
  return [
    baseUserMessage,
    '',
    '[运行中用户补充]',
    ...messages.map((message) => message.content.trim()).filter(Boolean),
  ].join('\n')
}

export function markRuntimeInputMessagesConsumed(run: AgentRun, messages: AgentMessage[]): void {
  if (messages.length === 0) return
  const consumed = Array.from(new Set([
    ...runtimeInputConsumedMessageIds(run),
    ...messages.map((message) => message.id),
  ]))
  run.metadata = {
    ...(run.metadata ?? {}),
    [CONSUMED_RUNTIME_INPUT_IDS_KEY]: consumed,
  }
}

export function runtimeInputConsumedMessageIds(run: AgentRun): string[] {
  const value = run.metadata?.[CONSUMED_RUNTIME_INPUT_IDS_KEY]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

export function runtimeInputMessageIdsFromTraceData(value: unknown): string[] {
  if (!isJSONRecord(value) || !Array.isArray(value.messageIds)) return []
  return value.messageIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function isRuntimeInputMessageForRun(message: AgentMessage, runId: string): boolean {
  const metadata = message.metadata
  if (!metadata || metadata.kind !== RUNTIME_INPUT_KIND) return false
  return metadata.targetRunId === runId || message.runId === runId
}

export function cloneRuntimeInputMessagesForTrace(messages: AgentMessage[]): JSONValue {
  return messages.map((message) => ({
    id: message.id,
    content: message.content,
    createdAt: message.createdAt,
    ...(message.metadata ? { metadata: cloneJSONValue(message.metadata) } : {}),
  }))
}
