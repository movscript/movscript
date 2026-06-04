import type { AgentTraceEvent } from '../../../../state/shared/types.js'
import { formatMs, modelCallIssue, modelCallStatusLabel, traceEventStatusLabel } from './labels.js'
import type { AgentMessageWriteView, AgentModelCallContextView, AgentModelCallSummary } from './types.js'
import { arrayValue, firstNumber, formatInteger, numberValue, recordValue, stringValue } from './values.js'

interface InternalModelCallGroup {
  id: string
  roundKey?: string
  events: AgentTraceEvent[]
  retries: AgentTraceEvent[]
  request?: AgentTraceEvent
  response?: AgentTraceEvent
  result?: AgentTraceEvent
  error?: AgentTraceEvent
}

export function buildModelCallSummaries(events: AgentTraceEvent[]): AgentModelCallSummary[] {
  const groups: InternalModelCallGroup[] = []
  const groupsByRound = new Map<string, InternalModelCallGroup>()
  const roundKeyOccurrences = new Map<string, number>()
  let currentWithoutRound: InternalModelCallGroup | undefined

  for (const event of events) {
    if (event.kind !== 'model_call') continue
    const data = recordValue(event.data)
    const phase = stringValue(data?.phase)
    const hasResponse = !!recordValue(data?.response)
    const isResultSummary = event.title === 'Model HTTP response received' && !hasResponse && (data?.finish_reason !== undefined || data?.content_chars !== undefined || data?.usage !== undefined || data?.tool_calls !== undefined)
    if (event.title === 'Model route selected' || (!phase && !isResultSummary)) continue

    const roundKey = event.roundId ?? (event.roundIndex !== undefined ? `round:${event.roundIndex}` : undefined)
    let group = roundKey ? groupsByRound.get(roundKey) : currentWithoutRound
    if (!group || phase === 'request') {
      const occurrence = roundKey ? (roundKeyOccurrences.get(roundKey) ?? 0) + 1 : undefined
      if (roundKey && occurrence !== undefined) roundKeyOccurrences.set(roundKey, occurrence)
      group = {
        id: roundKey ? `${roundKey}#${occurrence}` : `model-call-${groups.length + 1}`,
        ...(roundKey ? { roundKey } : {}),
        events: [],
        retries: [],
      }
      groups.push(group)
      if (roundKey) groupsByRound.set(roundKey, group)
      else currentWithoutRound = group
    }
    group.events.push(event)
    if (phase === 'request') group.request = event
    else if (hasResponse) group.response = event
    else if (isResultSummary) group.result = event
    else if (phase === 'retry') group.retries.push(event)
    else if (phase === 'error') group.error = event
  }

  const duplicatedRoundKeys = new Set(Array.from(roundKeyOccurrences.entries()).flatMap(([key, count]) => count > 1 ? [key] : []))
  return groups.map((group, index) => modelCallSummaryFromGroup(group, index + 1, group.roundKey ? duplicatedRoundKeys.has(group.roundKey) : false))
}

function modelCallSummaryFromGroup(group: InternalModelCallGroup, index: number, correlateByEventWindow = false): AgentModelCallSummary {
  const source = group.error ?? group.response ?? group.request ?? group.result ?? group.events[0]
  const requestData = recordValue(group.request?.data)
  const responseData = recordValue(group.response?.data)
  const resultData = recordValue(group.result?.data)
  const requestSnapshotBody = recordValue(recordValue(requestData?.request)?.body) ?? recordValue(recordValue(responseData?.request)?.body)
  const requestBody = modelSubmittedBody(requestSnapshotBody)
  const messageCount = numberValue(requestSnapshotBody?.messageCount) ?? arrayValue(requestSnapshotBody?.messages)?.length ?? arrayValue(requestBody?.input)?.length
  const toolCount = numberValue(requestSnapshotBody?.toolCount) ?? arrayValue(requestBody?.tools)?.length ?? arrayValue(requestSnapshotBody?.tools)?.length
  const response = recordValue(responseData?.response)
  const usage = recordValue(resultData?.usage) ?? recordValue(responseData?.usage)
  const responseChars = numberValue(resultData?.content_chars) ?? numberValue(responseData?.content_chars) ?? numberValue(response?.contentChars) ?? stringValue(response?.content)?.length
  const errorData = recordValue(group.error?.data)
  const status = group.error
    ? 'failed'
    : group.request && group.response
      ? 'complete'
      : group.request ? 'request_only'
        : group.response ? 'response_only'
          : 'result_only'
  return {
    id: group.id,
    label: `模型调用 ${index}`,
    ...(source?.roundId ? { roundId: source.roundId } : {}),
    ...(source?.roundIndex !== undefined ? { roundIndex: source.roundIndex } : {}),
    ...(source?.roundLabel ? { roundLabel: source.roundLabel } : {}),
    ...(correlateByEventWindow ? { correlateByEventWindow: true } : {}),
    eventIds: group.events.map((event) => event.id),
    status,
    statusLabel: modelCallStatusLabel(status),
    ...(group.request?.id ? { requestEventId: group.request.id } : {}),
    ...(group.response?.id ? { responseEventId: group.response.id } : {}),
    ...(group.result?.id ? { resultEventId: group.result.id } : {}),
    ...(stringValue(requestBody?.model) ?? stringValue(requestSnapshotBody?.model) ?? stringValue(requestData?.model) ?? stringValue(recordValue(requestData?.config)?.model) ? { model: stringValue(requestBody?.model) ?? stringValue(requestSnapshotBody?.model) ?? stringValue(requestData?.model) ?? stringValue(recordValue(requestData?.config)?.model) } : {}),
    ...(messageCount !== undefined ? { messageCount: String(messageCount) } : {}),
    ...(toolCount !== undefined ? { toolCount: String(toolCount) } : {}),
    ...(numberValue(response?.status) !== undefined ? { httpStatus: String(numberValue(response?.status)) } : {}),
    ...(formatMs(numberValue(responseData?.latencyMs) ?? numberValue(requestData?.latencyMs)) ? { latency: formatMs(numberValue(responseData?.latencyMs) ?? numberValue(requestData?.latencyMs)) } : {}),
    ...(responseChars !== undefined ? { responseChars: String(responseChars) } : {}),
    ...(numberValue(usage?.input_tokens) !== undefined ? { inputTokens: String(numberValue(usage?.input_tokens)) } : {}),
    ...(numberValue(usage?.output_tokens) !== undefined ? { outputTokens: String(numberValue(usage?.output_tokens)) } : {}),
    ...(group.retries.length > 0 ? { retryCount: String(group.retries.length) } : {}),
    ...(stringValue(errorData?.error) ? { error: stringValue(errorData?.error) } : {}),
    ...(modelCallIssue(status) ? { issue: modelCallIssue(status) } : {}),
    hasRequestPayload: !!requestSnapshotBody,
    hasResponseBody: !!stringValue(response?.bodyText) || !!stringValue(response?.bodyTextHash) || responseChars !== undefined,
  }
}

function modelSubmittedBody(body: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  return recordValue(body?.sdk_body) ?? body
}

export function modelCallTokenUsage(modelCalls: AgentModelCallSummary[]): { input: number; output: number; total: number; label: string } {
  const input = modelCalls.reduce((sum, call) => sum + firstNumber(call.inputTokens ?? ''), 0)
  const output = modelCalls.reduce((sum, call) => sum + firstNumber(call.outputTokens ?? ''), 0)
  const total = input + output
  const label = total > 0
    ? `${formatInteger(total)} tokens，in ${formatInteger(input)} / out ${formatInteger(output)}`
    : '0 tokens'
  return { input, output, total, label }
}

export function buildModelContextViews(input: {
  modelCalls: AgentModelCallSummary[]
  events: AgentTraceEvent[]
  messageWriteFromEvent: (event: AgentTraceEvent) => AgentMessageWriteView | undefined
}): AgentModelCallContextView[] {
  return input.modelCalls.map((call) => {
    const modelEvents = call.eventIds.flatMap((eventId) => input.events.find((event) => event.id === eventId) ?? [])
    const relatedEvents = input.events.filter((event) => {
      if (event.kind !== 'assistant' && event.kind !== 'tool_call') return false
      if (!call.correlateByEventWindow) {
        if (call.roundId && event.roundId === call.roundId) return true
        if (call.roundIndex !== undefined && event.roundIndex === call.roundIndex) return true
        if (call.roundId || call.roundIndex !== undefined) return false
      }
      return eventFallsInsideModelCallWindow(event, call, input.events)
    })
    const messageWrites = relatedEvents.filter((event) => event.kind === 'assistant')
    const toolCalls = relatedEvents.filter((event) => event.kind === 'tool_call')
    const roundCorrelationLabel = call.roundLabel
      ?? (call.roundIndex !== undefined ? `第 ${call.roundIndex} 轮` : call.roundId ? `轮次 ${call.roundId}` : '相邻事件窗口')
    const correlationLabel = call.correlateByEventWindow
      ? `相邻事件窗口（原始轮次 ${roundCorrelationLabel} 重复）`
      : roundCorrelationLabel
    return {
      callId: call.id,
      label: call.label,
      status: call.status,
      statusLabel: call.statusLabel,
      correlationLabel,
      ...(call.requestEventId ? { requestEventId: call.requestEventId } : {}),
      ...(call.responseEventId ? { responseEventId: call.responseEventId } : {}),
      ...(call.resultEventId ? { resultEventId: call.resultEventId } : {}),
      modelEventIds: modelEvents.map((event) => event.id),
      toolCalls: toolCalls.map((event) => ({
        eventId: event.id,
        ...(event.toolName ? { toolName: event.toolName } : {}),
        status: event.status,
        statusLabel: traceEventStatusLabel(event.status),
        ...(event.summary ? { summary: event.summary } : {}),
      })),
      messageWrites: messageWrites.map((event) => input.messageWriteFromEvent(event)).filter((item): item is AgentMessageWriteView => !!item),
      ...(call.responseChars && messageWrites.length === 0 ? { issue: '这次模型调用有回复内容，但没有找到同轮 assistant 历史写入。请检查回复是否只返回给调用方而未写入线程历史。' } : {}),
    }
  })
}

function eventFallsInsideModelCallWindow(event: AgentTraceEvent, call: AgentModelCallSummary, events: AgentTraceEvent[]): boolean {
  const modelEvents = call.eventIds
    .flatMap((eventId) => events.find((entry) => entry.id === eventId) ?? [])
    .map((entry) => ({ event: entry, time: Date.parse(entry.createdAt) }))
    .filter((entry) => Number.isFinite(entry.time))
    .sort((left, right) => left.time - right.time)
  const startTime = modelEvents[0]?.time
  const lastModelTime = modelEvents.at(-1)?.time
  const eventTime = Date.parse(event.createdAt)
  if (startTime === undefined || lastModelTime === undefined || !Number.isFinite(eventTime) || eventTime < startTime) return false
  const callEventIds = new Set(call.eventIds)
  const nextModelStart = events
    .filter((entry) => entry.kind === 'model_call' && !callEventIds.has(entry.id) && Date.parse(entry.createdAt) > lastModelTime)
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))[0]
  const endTime = nextModelStart ? Date.parse(nextModelStart.createdAt) : startTime + 10 * 60 * 1000
  return eventTime < endTime
}
