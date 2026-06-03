import { createHash } from 'node:crypto'
import type { AgentMessage, JSONValue } from '../../../../state/shared/types.js'

export type AssistantTraceSource = 'model' | 'runtime_rule' | 'assistant'

export function summarizeAssistantMessageTrace(input: {
  messageId: string
  content: string
  source: AssistantTraceSource
}): Record<string, JSONValue> {
  return {
    messageId: input.messageId,
    chars: input.content.length,
    contentHash: hashString(input.content),
    contentMode: 'summary',
    source: input.source,
  }
}

export function formatAssistantMessageTraceSummary(content: string): string {
  return `Assistant message created (${content.length} chars).`
}

export function summarizeUserMessageTrace(input: {
  messageId: string
  content: string
  source: 'run_input' | 'thread_message' | 'synthetic'
}): Record<string, JSONValue> {
  return {
    messageId: input.messageId,
    chars: input.content.length,
    contentHash: hashString(input.content),
    contentMode: 'summary',
    source: input.source,
  }
}

export function summarizeRuntimeInputMessagesTrace(
  messages: Array<Pick<AgentMessage, 'id' | 'content' | 'createdAt' | 'metadata'>>,
): JSONValue {
  return messages.map((message) => {
    const metadata = runtimeInputMetadataTrace(message.metadata)
    return {
      id: message.id,
      chars: message.content.length,
      contentHash: hashString(message.content),
      contentMode: 'summary',
      createdAt: message.createdAt,
      ...(metadata ? { metadata } : {}),
    }
  })
}

function runtimeInputMetadataTrace(metadata: AgentMessage['metadata']): Record<string, JSONValue> | undefined {
  if (!metadata) return undefined
  const output: Record<string, JSONValue> = {}
  for (const key of ['kind', 'targetRunId', 'mode', 'deliveryStatus']) {
    const value = metadata[key]
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
      output[key] = value
    }
  }
  return Object.keys(output).length > 0 ? output : undefined
}

function hashString(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}
