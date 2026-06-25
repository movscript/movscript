import type { AgentChatThreadItem } from '@movscript/agent-chat'
import {
  sdkRuntimeTextFromResult,
  sdkRuntimeThreadItemFromMessage,
} from './sdkRuntimeMessageMapper'
import { handleSdkRuntimeProviderServerRequest } from './sdkRuntimeServerRequestAdapter'
import type { SdkRuntimeRunPromptEventSink } from './sdkRuntimeTurnEvents'

export type CodexLikeThread = {
  run(prompt: string, options?: Record<string, unknown>): Promise<unknown>
  runStreamed?: (prompt: string, options?: Record<string, unknown>) => Promise<unknown> | unknown
}

export async function runCodexLikeSdkPrompt(
  thread: CodexLikeThread,
  prompt: string,
  options: Record<string, unknown> | undefined,
  events: SdkRuntimeRunPromptEventSink | undefined,
): Promise<unknown> {
  if (typeof thread.runStreamed !== 'function') return thread.run(prompt, options)
  const streamed = await thread.runStreamed(prompt, options)
  const stream = codexLikeStreamEvents(streamed)
  if (!stream) return thread.run(prompt, options)
  return collectCodexLikeStream(stream, events)
}

async function collectCodexLikeStream(
  stream: AsyncIterable<unknown>,
  sink: SdkRuntimeRunPromptEventSink | undefined,
): Promise<unknown> {
  const state: CodexLikeStreamState = {
    completedItems: [],
    textByItemId: new Map(),
    usage: null,
    finalResponse: '',
  }
  let index = 0
  for await (const event of stream) {
    await handleCodexLikeStreamEvent(event, index, state, sink)
    index += 1
  }
  return {
    items: state.completedItems,
    finalResponse: state.finalResponse || latestTextFromItems(state.completedItems),
    usage: state.usage,
  }
}

type CodexLikeStreamState = {
  completedItems: unknown[]
  textByItemId: Map<string, string>
  usage: unknown
  finalResponse: string
}

async function handleCodexLikeStreamEvent(
  event: unknown,
  index: number,
  state: CodexLikeStreamState,
  sink: SdkRuntimeRunPromptEventSink | undefined,
): Promise<void> {
  if (!isRecord(event)) return
  const type = stringField(event, 'type') ?? stringField(event, 'method') ?? ''
  if (isCodexLikeServerRequestEvent(event, type)) {
    await handleSdkRuntimeProviderServerRequest(sink, event)
    return
  }
  if (type === 'turn.completed') {
    state.usage = event.usage ?? null
    return
  }
  if (type === 'turn.failed') {
    const message = errorMessageFromEvent(event.error) ?? 'turn failed'
    throw new Error(message)
  }
  if (type === 'error') {
    throw new Error(stringField(event, 'message') ?? 'SDK runtime stream failed')
  }
  const directDelta = directAgentDeltaFromEvent(event)
  if (directDelta) {
    const itemId = directDelta.itemId ?? `${sink?.turnId ?? 'turn'}_assistant_${index}`
    const previous = state.textByItemId.get(itemId) ?? ''
    state.textByItemId.set(itemId, `${previous}${directDelta.delta}`)
    state.finalResponse = `${previous}${directDelta.delta}`
    emitAgentDelta(sink, {
      itemId,
      delta: directDelta.delta,
      phase: directDelta.phase,
      raw: event,
    })
    return
  }
  if (type !== 'item.started' && type !== 'item.updated' && type !== 'item.completed') return
  const item = isRecord(event.item) ? event.item : undefined
  if (!item) return
  const itemId = stringField(item, 'id') ?? `${sink?.turnId ?? 'turn'}_item_${index}`
  emitTextItemDelta(item, itemId, state, sink, event)
  if (type === 'item.completed') {
    state.completedItems.push(item)
    const text = codexLikeItemText(item)
    if (text) state.finalResponse = text
    const mapped = sink ? sdkRuntimeThreadItemFromMessage(item, sink.turnId, index) : null
    if (mapped) {
      emitItemCompleted(sink, mapped, event)
    }
    return
  }
  if (type === 'item.started') {
    const mapped = sink ? sdkRuntimeThreadItemFromMessage(item, sink.turnId, index) : null
    if (mapped && mapped.type !== 'agentMessage') emitItemStarted(sink, mapped, event)
  }
}

function isCodexLikeServerRequestEvent(event: Record<string, unknown>, type: string): boolean {
  if (isRecord(event.request)) return true
  return type === 'server.request'
    || type === 'serverRequest'
    || type === 'server_request'
    || type === 'approval.request'
    || type === 'approvalRequest'
    || type === 'tool.approval.request'
    || type === 'toolApprovalRequest'
    || type === 'item/permissions/requestApproval'
    || type === 'item/tool/call'
    || type === 'item/tool/requestUserInput'
    || type === 'mcpServer/elicitation/request'
    || type === 'execCommandApproval'
    || type === 'applyPatchApproval'
}

function emitTextItemDelta(
  item: Record<string, unknown>,
  itemId: string,
  state: CodexLikeStreamState,
  sink: SdkRuntimeRunPromptEventSink | undefined,
  raw: unknown,
): void {
  const itemType = stringField(item, 'type') ?? ''
  const text = codexLikeItemText(item)
  if (!text) return
  const previous = state.textByItemId.get(itemId) ?? ''
  const delta = textDelta(previous, text)
  state.textByItemId.set(itemId, text)
  if (!delta) return
  if (itemType === 'reasoning') {
    sink?.emit({
      type: 'reasoning.delta',
      turnId: sink.turnId,
      itemId,
      delta,
      summary: true,
      index: 0,
      raw,
    })
    return
  }
  if (itemType === 'agent_message' || itemType === 'assistant' || itemType === 'message' || itemType === 'assistant_message') {
    state.finalResponse = text
    emitAgentDelta(sink, { itemId, delta, phase: null, raw })
  }
}

function emitAgentDelta(
  sink: SdkRuntimeRunPromptEventSink | undefined,
  input: {
    itemId: string
    delta: string
    phase?: string | null
    raw?: unknown
  },
): void {
  if (!sink || !input.delta) return
  sink.emit({
    type: 'agent.delta',
    turnId: sink.turnId,
    itemId: input.itemId,
    delta: input.delta,
    phase: input.phase ?? null,
    raw: input.raw,
  })
}

function emitItemStarted(
  sink: SdkRuntimeRunPromptEventSink | undefined,
  item: AgentChatThreadItem,
  raw: unknown,
): void {
  sink?.emit({
    type: 'item.started',
    turnId: sink.turnId,
    item,
    raw,
  })
}

function emitItemCompleted(
  sink: SdkRuntimeRunPromptEventSink | undefined,
  item: AgentChatThreadItem,
  raw: unknown,
): void {
  sink?.emit({
    type: 'item.completed',
    turnId: sink.turnId,
    item,
    raw,
  })
}

function codexLikeStreamEvents(value: unknown): AsyncIterable<unknown> | undefined {
  if (isAsyncIterable(value)) return value
  if (!isRecord(value)) return undefined
  const events = value.events
  return isAsyncIterable(events) ? events : undefined
}

function directAgentDeltaFromEvent(event: Record<string, unknown>): { itemId?: string; delta: string; phase?: string | null } | undefined {
  const type = stringField(event, 'type') ?? stringField(event, 'method') ?? ''
  if (type !== 'agent.delta' && type !== 'item/agentMessage/delta' && type !== 'item.agentMessage.delta') return undefined
  const params = isRecord(event.params) ? event.params : event
  const delta = stringField(params, 'delta')
  if (!delta) return undefined
  return {
    itemId: stringField(params, 'itemId') ?? stringField(params, 'item_id'),
    delta,
    phase: stringField(params, 'phase') ?? null,
  }
}

function codexLikeItemText(item: Record<string, unknown>): string | undefined {
  return stringField(item, 'text')
    ?? stringField(item, 'result')
    ?? stringField(item, 'finalResponse')
    ?? stringField(item, 'final_response')
    ?? textFromContent(item.content)
}

function latestTextFromItems(items: unknown[]): string {
  return items.map(sdkRuntimeTextFromResult).filter(Boolean).at(-1) ?? ''
}

function textDelta(previous: string, next: string): string {
  if (!previous) return next
  if (!next) return ''
  if (next.startsWith(previous)) return next.slice(previous.length)
  if (previous.startsWith(next)) return ''
  return next
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

function errorMessageFromEvent(error: unknown): string | undefined {
  if (error instanceof Error) return error.message
  if (isRecord(error)) return stringField(error, 'message')
  return typeof error === 'string' && error.trim() ? error : undefined
}

function stringField(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return isRecord(value) && typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function'
}
