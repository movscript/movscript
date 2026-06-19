import type { SdkRuntimeRunPromptEventSink } from './sdkRuntimeTurnEvents'

export function emitClaudeSdkRuntimeTurnEvents(
  message: unknown,
  index: number,
  sink: SdkRuntimeRunPromptEventSink | undefined,
): boolean {
  if (!sink || !isRecord(message)) return false
  const type = stringField(message, 'type') ?? stringField(message, 'role') ?? ''
  const text = stringField(message, 'text')
    ?? stringField(message, 'delta')
    ?? textFromContent(message.content)
  if (!text) return false
  if (isReasoningType(type)) {
    sink.emit({
      type: 'reasoning.delta',
      turnId: sink.turnId,
      itemId: sdkRuntimeStreamItemId(sink.turnId, 'reasoning', message, index),
      delta: text,
      summary: true,
      index: 0,
      raw: message,
    })
    return true
  }
  if (isAssistantMessageType(type)) {
    sink.emit({
      type: 'agent.delta',
      turnId: sink.turnId,
      itemId: sdkRuntimeStreamItemId(sink.turnId, 'assistant', message, index),
      delta: text,
      phase: null,
      raw: message,
    })
    return true
  }
  return false
}

function sdkRuntimeStreamItemId(turnId: string, prefix: string, raw: Record<string, unknown>, index: number): string {
  return stringField(raw, 'id')
    ?? stringField(raw, 'uuid')
    ?? stringField(raw, 'messageId')
    ?? `${turnId}_${prefix}_${index}`
}

function isAssistantMessageType(type: string): boolean {
  return type === 'assistant' || type === 'message' || type === 'assistant_message'
}

function isReasoningType(type: string): boolean {
  return /reasoning|thinking|summary/i.test(type)
}

function textFromContent(content: unknown): string | undefined {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return undefined
  const parts = content
    .map((item) => {
      if (typeof item === 'string') return item
      if (!isRecord(item)) return ''
      return stringField(item, 'text') ?? stringField(item, 'content') ?? ''
    })
    .filter(Boolean)
  return parts.length > 0 ? parts.join('\n') : undefined
}

function stringField(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
