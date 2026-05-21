import type { AgentRun, AgentTraceEvent } from '../state/types.js'
import type { AgentRunTraceSummary } from '../state/runTrace.js'

const DEBUG_BUNDLE_SCHEMA = 'movscript.agent-run-debug-bundle.v1'
const DEBUG_BUNDLE_SCHEMA_URL = 'https://movscript.dev/schemas/agent-run-debug-bundle-v1.schema.json'
const DEBUG_BUNDLE_CAPABILITIES = [
  'runSummary',
  'readinessChecklist',
  'modelCallContexts',
  'promptDetails',
  'messageWrites',
  'toolCalls',
  'attentionEvents',
  'pendingActions',
  'fieldGuide',
  'redactedDebugData',
] as const

export interface AgentTraceDebugView {
  schema: 'movscript.agent-trace-debug-view.v1'
  generatedAt: string
  runId: string
  run: AgentRun
  trace: {
    loaded: number
    total: number
    hasMore: false
  }
  coverage: AgentDebugCoverageSummary
  readinessChecklist: AgentDebugReadinessItem[]
  modelCalls: AgentModelCallSummary[]
  modelCallContexts: AgentModelCallContextView[]
  skillTimeline: AgentSkillTraceSummary
  promptDetails: AgentPromptDetailView[]
  messageWrites: AgentMessageWriteView[]
  toolCalls: AgentToolCallView[]
  attentionEvents: AgentDebugAttentionEvent[]
  pendingActions: AgentPendingActionView[]
  fieldGuide: AgentDebugFieldGuideItem[]
  events: AgentTraceEvent[]
  reportText: string
  bundle: Record<string, unknown>
}

export interface AgentDebugCoverageSummary {
  loadedLabel: string
  hasUnloadedTrace: boolean
  modelCallsLabel: string
  promptDetailsLabel: string
  messageWritesLabel: string
  toolDetailsLabel: string
  httpResponsesLabel: string
  requestPayloadsLabel: string
  httpResponseBodiesLabel: string
  issues: string[]
}

export interface AgentDebugReadinessItem {
  id: string
  label: string
  status: 'ok' | 'warning'
  detail: string
  action: string
}

export interface AgentDebugFieldGuideItem {
  id: 'model_request' | 'model_response' | 'history_write' | 'missing_data'
  label: string
  description: string
}

export interface AgentModelCallSummary {
  id: string
  label: string
  roundId?: string
  roundIndex?: number
  roundLabel?: string
  correlateByEventWindow?: boolean
  eventIds: string[]
  status: 'complete' | 'request_only' | 'response_only' | 'result_only' | 'failed'
  statusLabel: string
  requestEventId?: string
  responseEventId?: string
  resultEventId?: string
  model?: string
  messageCount?: string
  toolCount?: string
  httpStatus?: string
  latency?: string
  responseChars?: string
  inputTokens?: string
  outputTokens?: string
  retryCount?: string
  error?: string
  issue?: string
  hasRequestPayload: boolean
  hasResponseBody: boolean
}

export interface AgentModelCallContextView {
  callId: string
  label: string
  status: AgentModelCallSummary['status']
  statusLabel: string
  correlationLabel: string
  requestEventId?: string
  responseEventId?: string
  resultEventId?: string
  modelEventIds: string[]
  toolCalls: Array<{ eventId: string; toolName?: string; status: string; statusLabel: string; summary?: string }>
  messageWrites: Array<{ eventId: string; messageId?: string; source?: string; sourceLabel?: string; contentChars: number; contentPreview?: string }>
  issue?: string
}

export interface AgentSkillTraceEntry {
  eventId: string
  createdAt: string
  eventType: string
  title: string
  summary?: string
  activeSkillIds: string[]
  loadedSkillIds: string[]
  unloadedSkillIds: string[]
  availableSkillIds: string[]
}

export interface AgentSkillTraceSummary {
  timeline: AgentSkillTraceEntry[]
  currentActiveSkillIds: string[]
  currentLoadedSkillIds: string[]
  currentUnloadedSkillIds: string[]
  currentAvailableSkillIds: string[]
}

export interface AgentPromptDetailView {
  eventId: string
  title: string
  totalChars?: string
  messageCount?: string
  systemMessageCount?: string
  blockedToolCount?: string
  skills: string[]
  tools: string[]
  layers: Array<{ label: string; value: string }>
  contextLayers: Array<{ label: string; value: string }>
  partGroups: Array<{ contextLayer: string; count: number; chars: string; partIds: string[] }>
  parts: Array<{ id: string; layer?: string; contextLayer?: string; chars?: string }>
}

export interface AgentMessageWriteView {
  eventId: string
  messageId?: string
  source?: string
  sourceLabel?: string
  contentChars: number
  contentPreview?: string
}

export interface AgentToolCallView {
  eventId: string
  toolName?: string
  title: string
  status: AgentTraceEvent['status']
  statusLabel: string
  source?: string
  sandboxed?: boolean
  durationMs?: number
  summary?: string
  dataPreview?: string
}

export interface AgentDebugAttentionEvent {
  eventId: string
  createdAt: string
  kind: AgentTraceEvent['kind']
  kindLabel: string
  status: AgentTraceEvent['status']
  statusLabel: string
  title: string
  summary?: string
  behavior?: string
  impact?: string
  error?: string
}

export type AgentPendingActionView =
  | {
    type: 'approval'
    id: string
    createdAt: string
    toolName: string
    status: string
    reason?: string
    risk?: string
    permission?: string
  }
  | {
    type: 'input'
    id: string
    createdAt: string
    title: string
    question: string
    inputType: string
    choices: Array<{ id: string; label: string; description?: string }>
    allowCustomAnswer: boolean
    status: string
  }

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

export function buildRuntimeTraceDebugView(input: {
  run: AgentRun
  events: AgentTraceEvent[]
  summary: AgentRunTraceSummary
  generatedAt?: string
}): AgentTraceDebugView {
  const generatedAt = input.generatedAt ?? new Date().toISOString()
  const events = [...input.events].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const modelCalls = buildModelCallSummaries(events)
  const coverage = buildDebugCoverageSummary({ events, total: input.summary.total, modelCalls })
  const readinessChecklist = buildDebugReadinessChecklist(coverage)
  const promptDetails = buildPromptDetails(events)
  const messageWrites = buildMessageWrites(events)
  const toolCalls = buildToolCalls(events)
  const modelCallContexts = buildModelCallContexts({ modelCalls, events })
  const skillTimeline = buildSkillTraceSummary(events)
  const attentionEvents = buildAttentionEvents(events)
  const pendingActions = buildPendingActions(input.run)
  const trace = {
    loaded: events.length,
    total: input.summary.total,
    hasMore: false as const,
  }
  const reportText = buildDebugReportText({
    runId: input.run.id,
    run: input.run,
    coverage,
    modelCalls,
    events,
  })
  const bundle = {
    schema: DEBUG_BUNDLE_SCHEMA,
    schemaUrl: DEBUG_BUNDLE_SCHEMA_URL,
    generatedAt,
    capabilities: DEBUG_BUNDLE_CAPABILITIES,
    runId: input.run.id,
    run: debugBundleRunSnapshot(input.run),
    runSummary: debugBundleRunSummary(input.run),
    trace,
    fieldGuide: AGENT_DEBUG_FIELD_GUIDE,
    coverage,
    readinessChecklist,
    modelCalls,
    modelCallContexts,
    promptDetails,
    messageWrites,
    toolCalls,
    attentionEvents,
    pendingActions,
    events,
  }
  return {
    schema: 'movscript.agent-trace-debug-view.v1',
    generatedAt,
    runId: input.run.id,
    run: input.run,
    trace,
    coverage,
    readinessChecklist,
    modelCalls,
    modelCallContexts,
    skillTimeline,
    promptDetails,
    messageWrites,
    toolCalls,
    attentionEvents,
    pendingActions,
    fieldGuide: AGENT_DEBUG_FIELD_GUIDE,
    events,
    reportText,
    bundle,
  }
}

export const AGENT_DEBUG_FIELD_GUIDE: AgentDebugFieldGuideItem[] = [
  {
    id: 'model_request',
    label: '模型请求',
    description: '发送给模型网关的 headers、payload、messages、tools。',
  },
  {
    id: 'model_response',
    label: '模型响应',
    description: '网关返回的 headers、原始 body、解析后的 usage 和 finish reason。',
  },
  {
    id: 'history_write',
    label: '历史写入',
    description: 'assistant 回复是否已经进入线程历史，后续 run 可能会再次带入上下文。',
  },
  {
    id: 'missing_data',
    label: '缺失项',
    description: '服务端 debug view 基于全量 trace 计算；如果仍缺失，通常是旧运行、异常中断或当时未采集。',
  },
]

function buildDebugCoverageSummary(input: {
  events: AgentTraceEvent[]
  total: number
  modelCalls: AgentModelCallSummary[]
}): AgentDebugCoverageSummary {
  const promptDetails = buildPromptDetails(input.events).length
  const messageWrites = buildMessageWrites(input.events).length
  const toolCalls = input.events.filter((event) => event.kind === 'tool_call').length
  const toolDetails = buildToolCalls(input.events).length
  const httpResponses = input.modelCalls.filter((call) => call.responseEventId).length
  const requestPayloads = input.modelCalls.filter((call) => call.hasRequestPayload).length
  const httpResponseBodies = input.modelCalls.filter((call) => call.hasResponseBody).length
  const incompleteModelCalls = input.modelCalls.filter((call) => call.status !== 'complete')
  const modelCallsWithoutRequestPayload = input.modelCalls.filter((call) => !call.hasRequestPayload && call.status !== 'result_only')
  const httpResponsesWithoutBody = Math.max(0, httpResponses - httpResponseBodies)
  const modelCallsWithReply = input.modelCalls.filter((call) => Number(call.responseChars ?? 0) > 0)
  const issues = [
    incompleteModelCalls.length > 0 ? `${incompleteModelCalls.length} 次模型调用缺少请求或响应事件；服务端已使用全量 trace 计算，如果仍缺失，多半是异常中断或当时未采集到完整 HTTP 详情。` : undefined,
    modelCallsWithoutRequestPayload.length > 0 ? `${modelCallsWithoutRequestPayload.length} 次模型调用没有请求负载；无法展开当时发送给模型的完整 messages/tools/body。` : undefined,
    httpResponsesWithoutBody > 0 ? `${httpResponsesWithoutBody} 次模型 HTTP 响应没有原始响应正文；可以看到状态和解析结果，但无法展开完整回复 body。` : undefined,
    input.events.length > 0 && promptDetails === 0 ? '全量 trace 里没有模型上下文详情；可能是旧运行未记录 Prompt composed 事件。' : undefined,
    modelCallsWithReply.length > 0 && messageWrites === 0 ? `${modelCallsWithReply.length} 次模型调用有回复内容，但全量 trace 里没有 assistant 历史写入；请检查最终回复是否保存到线程历史。` : undefined,
    toolCalls > 0 && toolDetails < toolCalls ? `${toolCalls - toolDetails} 次工具调用没有结构化详情；只能查看原始事件数据。` : undefined,
  ].filter((issue): issue is string => !!issue)
  return {
    loadedLabel: `${input.events.length} / ${input.total}`,
    hasUnloadedTrace: false,
    modelCallsLabel: `${input.modelCalls.length}`,
    promptDetailsLabel: `${promptDetails}`,
    messageWritesLabel: `${messageWrites}`,
    toolDetailsLabel: `${toolDetails} / ${toolCalls}`,
    httpResponsesLabel: `${httpResponses}`,
    requestPayloadsLabel: `${requestPayloads}`,
    httpResponseBodiesLabel: `${httpResponseBodies}`,
    issues,
  }
}

function buildDebugReadinessChecklist(summary: AgentDebugCoverageSummary): AgentDebugReadinessItem[] {
  const modelCalls = firstNumber(summary.modelCallsLabel)
  const promptDetails = firstNumber(summary.promptDetailsLabel)
  const messageWrites = firstNumber(summary.messageWritesLabel)
  const requestPayloads = firstNumber(summary.requestPayloadsLabel)
  const httpResponses = firstNumber(summary.httpResponsesLabel)
  const httpResponseBodies = firstNumber(summary.httpResponseBodiesLabel)
  const [toolDetails, toolCalls] = slashNumbers(summary.toolDetailsLabel)
  return [
    {
      id: 'trace_loaded',
      label: '事件完整性',
      status: 'ok',
      detail: `服务端已使用全量 trace 计算：${summary.loadedLabel}。`,
      action: '可以基于当前 debug view 继续判断；分页时间线只影响浏览，不影响摘要。',
    },
    {
      id: 'context_detail',
      label: '上下文可解释',
      status: promptDetails > 0 ? 'ok' : 'warning',
      detail: promptDetails > 0 ? `已记录 ${promptDetails} 条模型上下文详情。` : '没有模型上下文详情，难以判断 agent 当时看到了什么。',
      action: promptDetails > 0 ? '展开“上下文详情”查看来源层级和片段。' : '按旧运行或采集缺口处理，重新运行可补齐。',
    },
    {
      id: 'model_http',
      label: '模型 HTTP 链路',
      status: modelCalls === 0 || httpResponses >= modelCalls ? 'ok' : 'warning',
      detail: modelCalls === 0 ? '当前没有模型调用。' : `模型调用 ${modelCalls} 次，HTTP 响应 ${httpResponses} 次。`,
      action: modelCalls === 0 ? '无需检查模型 HTTP。' : httpResponses >= modelCalls ? '展开“大模型调用总览”核对请求、响应和结果。' : '检查失败、取消或重试事件。',
    },
    {
      id: 'request_payload',
      label: '请求负载可展开',
      status: modelCalls === 0 || requestPayloads >= modelCalls ? 'ok' : 'warning',
      detail: modelCalls === 0 ? '当前没有模型请求负载。' : `已保存 ${requestPayloads} / ${modelCalls} 个请求负载。`,
      action: modelCalls === 0 ? '无需检查请求负载。' : requestPayloads >= modelCalls ? '展开“完整请求负载”和“请求消息”核对发送给模型的上下文。' : '定位缺失轮次；旧运行可能无法补齐，只能重新运行采集。',
    },
    {
      id: 'response_body',
      label: '响应正文可展开',
      status: httpResponses === 0 || httpResponseBodies >= httpResponses ? 'ok' : 'warning',
      detail: httpResponses === 0 ? '当前没有 HTTP 响应。' : `已保存 ${httpResponseBodies} / ${httpResponses} 个响应正文。`,
      action: httpResponses === 0 ? '无需检查响应正文。' : httpResponseBodies >= httpResponses ? '展开“HTTP 响应”核对原始 body 和模型结果。' : '定位缺失响应正文；流式或旧采集数据只能用模型结果和历史写入交叉验证。',
    },
    {
      id: 'history_write',
      label: '历史写入可追踪',
      status: modelCalls === 0 || messageWrites > 0 ? 'ok' : 'warning',
      detail: messageWrites > 0 ? `已记录 ${messageWrites} 条历史写入。` : '没有 assistant 历史写入，需确认模型回复是否进入线程历史。',
      action: messageWrites > 0 ? '在同轮详情里对照模型回复和 assistant 历史写入。' : '检查模型是否只产出工具调用、是否失败，或最终回复是否未写入线程。',
    },
    {
      id: 'tool_detail',
      label: '工具结果可解释',
      status: toolCalls === 0 || toolDetails >= toolCalls ? 'ok' : 'warning',
      detail: toolCalls === 0 ? '当前没有工具调用。' : `结构化工具详情 ${toolDetails} / ${toolCalls}。`,
      action: toolCalls === 0 ? '无需检查工具详情。' : toolDetails >= toolCalls ? '展开工具详情查看输入、结果、耗时和沙箱信息。' : '用原始事件数据兜底；必要时补充工具结果结构化采集。',
    },
  ]
}

function buildModelCallSummaries(events: AgentTraceEvent[]): AgentModelCallSummary[] {
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
  const requestBody = recordValue(recordValue(requestData?.request)?.body) ?? recordValue(recordValue(responseData?.request)?.body)
  const response = recordValue(responseData?.response)
  const usage = recordValue(resultData?.usage) ?? recordValue(responseData?.usage)
  const responseChars = numberValue(resultData?.content_chars) ?? numberValue(responseData?.content_chars) ?? stringValue(response?.content)?.length
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
    ...(stringValue(requestBody?.model) ?? stringValue(requestData?.model) ?? stringValue(recordValue(requestData?.config)?.model) ? { model: stringValue(requestBody?.model) ?? stringValue(requestData?.model) ?? stringValue(recordValue(requestData?.config)?.model) } : {}),
    ...(arrayValue(requestBody?.messages) ? { messageCount: String(arrayValue(requestBody?.messages)!.length) } : {}),
    ...(arrayValue(requestBody?.tools) ? { toolCount: String(arrayValue(requestBody?.tools)!.length) } : {}),
    ...(numberValue(response?.status) !== undefined ? { httpStatus: String(numberValue(response?.status)) } : {}),
    ...(formatMs(numberValue(responseData?.latencyMs) ?? numberValue(requestData?.latencyMs)) ? { latency: formatMs(numberValue(responseData?.latencyMs) ?? numberValue(requestData?.latencyMs)) } : {}),
    ...(responseChars !== undefined ? { responseChars: String(responseChars) } : {}),
    ...(numberValue(usage?.input_tokens) !== undefined ? { inputTokens: String(numberValue(usage?.input_tokens)) } : {}),
    ...(numberValue(usage?.output_tokens) !== undefined ? { outputTokens: String(numberValue(usage?.output_tokens)) } : {}),
    ...(group.retries.length > 0 ? { retryCount: String(group.retries.length) } : {}),
    ...(stringValue(errorData?.error) ? { error: stringValue(errorData?.error) } : {}),
    ...(modelCallIssue(status) ? { issue: modelCallIssue(status) } : {}),
    hasRequestPayload: !!requestBody,
    hasResponseBody: !!stringValue(response?.bodyText),
  }
}

function buildModelCallContexts(input: {
  modelCalls: AgentModelCallSummary[]
  events: AgentTraceEvent[]
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
      messageWrites: messageWrites.map((event) => messageWriteFromEvent(event)).filter((item): item is AgentMessageWriteView => !!item),
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

function buildSkillTraceSummary(events: AgentTraceEvent[]): AgentSkillTraceSummary {
  const timeline = events.flatMap((event): AgentSkillTraceEntry[] => {
    const data = recordValue(event.data)
    const skillData = skillTraceData(event, data)
    const eventType = stringValue(skillData?.skillEventType) ?? stringValue(skillData?.eventType)
    if (event.kind !== 'skill' && !eventType?.startsWith('skill.')) return []
    return [{
      eventId: event.id,
      createdAt: event.createdAt,
      eventType: eventType ?? 'skill.event',
      title: skillTraceTitle(eventType, event.title),
      ...(event.summary ? { summary: event.summary } : {}),
      activeSkillIds: stringList(skillData?.activeSkillIds),
      loadedSkillIds: stringList(skillData?.loadedSkillIds),
      unloadedSkillIds: stringList(skillData?.unloadedSkillIds),
      availableSkillIds: stringList(skillData?.availableSkillIds),
    }]
  })
  const latest = timeline.at(-1)
  return {
    timeline,
    currentActiveSkillIds: latest?.activeSkillIds ?? [],
    currentLoadedSkillIds: latest?.loadedSkillIds ?? [],
    currentUnloadedSkillIds: latest?.unloadedSkillIds ?? [],
    currentAvailableSkillIds: latest?.availableSkillIds ?? [],
  }
}

function skillTraceData(event: AgentTraceEvent, data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const directEventType = stringValue(data?.skillEventType) ?? stringValue(data?.eventType)
  if (directEventType?.startsWith('skill.')) return data
  if (event.toolName !== 'movscript_update_active_skills') return data
  const result = recordValue(data?.result)
  return stringValue(result?.eventType)?.startsWith('skill.') ? result : data
}

function buildPromptDetails(events: AgentTraceEvent[]): AgentPromptDetailView[] {
  return events.flatMap((event): AgentPromptDetailView[] => {
    if (event.kind !== 'prompt') return []
    const data = recordValue(event.data)
    const promptStats = recordValue(data?.promptStats)
    const parts = arrayValue(promptStats?.parts)?.slice(0, 24).map((part, index) => {
      const record = recordValue(part)
      return {
        id: stringValue(record?.id) ?? `part_${index + 1}`,
        ...(localizedPromptLayer(stringValue(record?.layer)) ? { layer: localizedPromptLayer(stringValue(record?.layer)) } : {}),
        ...(localizedPromptContextLayer(stringValue(record?.contextLayer)) ? { contextLayer: localizedPromptContextLayer(stringValue(record?.contextLayer)) } : {}),
        ...(numberValue(record?.chars) !== undefined ? { chars: String(numberValue(record?.chars)) } : {}),
      }
    }) ?? []
    const skills = stringList(data?.skillIds)
    const tools = stringList(data?.availableToolNames)
    if (!promptStats && skills.length === 0 && tools.length === 0) return []
    return [{
      eventId: event.id,
      title: '模型上下文详情',
      ...(numberValue(promptStats?.totalChars) !== undefined ? { totalChars: String(numberValue(promptStats?.totalChars)) } : numberValue(data?.charCount) !== undefined ? { totalChars: String(numberValue(data?.charCount)) } : {}),
      ...(numberValue(data?.messageCount) !== undefined ? { messageCount: String(numberValue(data?.messageCount)) } : {}),
      ...(numberValue(data?.systemMessageCount) !== undefined ? { systemMessageCount: String(numberValue(data?.systemMessageCount)) } : {}),
      ...(numberValue(data?.blockedToolCount) !== undefined ? { blockedToolCount: String(numberValue(data?.blockedToolCount)) } : {}),
      skills,
      tools,
      layers: metricEntries(recordValue(promptStats?.byLayer), localizedPromptLayer),
      contextLayers: metricEntries(recordValue(promptStats?.byContextLayer), localizedPromptContextLayer),
      partGroups: promptPartGroups(parts),
      parts,
    }]
  })
}

function buildMessageWrites(events: AgentTraceEvent[]): AgentMessageWriteView[] {
  return events.map((event) => messageWriteFromEvent(event)).filter((item): item is AgentMessageWriteView => !!item)
}

function messageWriteFromEvent(event: AgentTraceEvent): AgentMessageWriteView | undefined {
  if (event.kind !== 'assistant' && event.kind !== 'message') return undefined
  const data = recordValue(event.data)
  const messageId = stringValue(data?.messageId)
  const source = stringValue(data?.source) ?? (event.kind === 'assistant' ? 'assistant' : undefined)
  const content = stringValue(data?.content) ?? stringValue(data?.message) ?? stringValue(data?.assistantMessage)
  const contentChars = numberValue(data?.contentChars) ?? content?.length ?? 0
  if (!messageId && !content && event.title !== 'Assistant message created') return undefined
  return {
    eventId: event.id,
    ...(messageId ? { messageId } : {}),
    ...(source ? { source, sourceLabel: source } : {}),
    contentChars,
    ...(content ? { contentPreview: previewText(content) } : event.summary ? { contentPreview: previewText(event.summary) } : {}),
  }
}

function buildToolCalls(events: AgentTraceEvent[]): AgentToolCallView[] {
  return events.flatMap((event): AgentToolCallView[] => {
    if (event.kind !== 'tool_call') return []
    const data = recordValue(event.data)
    return [{
      eventId: event.id,
      ...(event.toolName ? { toolName: event.toolName } : {}),
      title: event.title,
      status: event.status,
      statusLabel: traceEventStatusLabel(event.status),
      ...(stringValue(data?.source) ? { source: stringValue(data?.source) } : {}),
      ...(typeof data?.sandboxed === 'boolean' ? { sandboxed: data.sandboxed } : {}),
      ...(numberValue(data?.durationMs) !== undefined ? { durationMs: numberValue(data?.durationMs) } : event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
      ...(event.summary ? { summary: event.summary } : {}),
      ...(data?.result !== undefined ? { dataPreview: previewJSON(data.result) } : {}),
    }]
  })
}

function buildAttentionEvents(events: AgentTraceEvent[]): AgentDebugAttentionEvent[] {
  return events
    .filter((event) => event.status === 'failed' || event.status === 'blocked' || event.kind === 'error' || event.kind === 'approval' || event.kind === 'input')
    .map((event) => {
      const data = recordValue(event.data)
      return {
        eventId: event.id,
        createdAt: event.createdAt,
        kind: event.kind,
        kindLabel: traceKindLabel(event.kind),
        status: event.status,
        statusLabel: traceEventStatusLabel(event.status),
        title: localizedTraceTitle(event),
        ...(event.summary ? { summary: event.summary } : {}),
        ...(traceBehavior(event) ? { behavior: traceBehavior(event) } : {}),
        ...(traceImpact(event) ? { impact: traceImpact(event) } : {}),
        ...(stringValue(data?.error) ? { error: stringValue(data?.error) } : {}),
      }
    })
}

function buildPendingActions(run: AgentRun): AgentPendingActionView[] {
  if (run.status !== 'requires_action') return []
  const approvals: AgentPendingActionView[] = (run.pendingApprovals ?? [])
    .filter((approval) => approval.status === 'pending')
    .map((approval) => ({
      type: 'approval' as const,
      id: approval.id,
      createdAt: approval.createdAt,
      toolName: approval.toolName,
      status: approval.status,
      ...(approval.reason ? { reason: approval.reason } : {}),
      ...(approval.risk ? { risk: approval.risk } : {}),
      ...(approval.permission ? { permission: approval.permission } : {}),
    }))
  const inputs: AgentPendingActionView[] = (run.pendingInputRequests ?? [])
    .filter((request) => request.status === 'pending')
    .map((request) => ({
      type: 'input' as const,
      id: request.id,
      createdAt: request.createdAt,
      title: request.title,
      question: request.question,
      inputType: request.inputType,
      choices: request.choices,
      allowCustomAnswer: request.allowCustomAnswer,
      status: request.status,
    }))
  return [...approvals, ...inputs]
}

function buildDebugReportText(input: {
  runId: string
  run: AgentRun
  coverage: AgentDebugCoverageSummary
  modelCalls: AgentModelCallSummary[]
  events: AgentTraceEvent[]
}): string {
  const runEndedAt = input.run.completedAt ?? input.run.failedAt ?? input.run.cancelledAt
  const lines = [
    'AgentRun 调试摘要',
    `运行: ${input.runId}`,
    `状态: ${runStatusLabel(input.run.status)}`,
    `角色: ${runRoleLabel(input.run.role)}`,
    `创建: ${formatTimestamp(input.run.createdAt)}`,
    input.run.startedAt ? `开始: ${formatTimestamp(input.run.startedAt)}` : undefined,
    runEndedAt ? `结束: ${formatTimestamp(runEndedAt)}` : undefined,
    input.run.error ? `错误: ${input.run.error}` : undefined,
    input.run.warnings && input.run.warnings.length > 0 ? `警告: ${input.run.warnings.join('；')}` : undefined,
    `事件: ${input.coverage.loadedLabel}`,
    `模型调用: ${input.coverage.modelCallsLabel}`,
    `HTTP 响应: ${input.coverage.httpResponsesLabel}`,
    `请求负载: ${input.coverage.requestPayloadsLabel}`,
    `响应正文: ${input.coverage.httpResponseBodiesLabel}`,
    `上下文详情: ${input.coverage.promptDetailsLabel}`,
    `历史写入: ${input.coverage.messageWritesLabel}`,
    `工具详情: ${input.coverage.toolDetailsLabel}`,
  ].filter((line): line is string => !!line)
  const checklist = buildDebugReadinessChecklist(input.coverage)
  if (checklist.length > 0) {
    lines.push('', '诊断清单:')
    for (const item of checklist) {
      lines.push(`- ${item.status === 'ok' ? '已满足' : '需补全'} ${item.label}: ${item.detail}`)
      lines.push(`  - 下一步: ${item.action}`)
    }
  }
  if (input.coverage.issues.length > 0) {
    lines.push('', '需关注:')
    for (const issue of input.coverage.issues) lines.push(`- ${issue}`)
  }
  if (input.modelCalls.length > 0) {
    lines.push('', '模型调用:')
    for (const call of input.modelCalls) {
      lines.push(`- ${call.label}: ${call.statusLabel}${call.model ? `，模型 ${call.model}` : ''}${call.httpStatus ? `，HTTP ${call.httpStatus}` : ''}${call.latency ? `，${call.latency}` : ''}${call.retryCount ? `，重试 ${call.retryCount} 次` : ''}${call.error ? `，错误 ${call.error}` : ''}`)
      if (call.issue) lines.push(`  - ${call.issue}`)
    }
  }
  const attention = buildAttentionEvents(input.events)
  if (attention.length > 0) {
    lines.push('', '异常/需关注事件:')
    for (const event of attention.slice(0, 8)) {
      lines.push(`- ${formatTimestamp(event.createdAt)} ${event.kindLabel} ${event.statusLabel}: ${event.title}${event.summary ? ` - ${event.summary}` : ''}`)
    }
  }
  return `${lines.join('\n')}\n`
}

function debugBundleRunSnapshot(run: AgentRun): Omit<AgentRun, 'traceEvents'> {
  const { traceEvents: _traceEvents, ...snapshot } = run
  return snapshot
}

function debugBundleRunSummary(run: AgentRun): Record<string, unknown> {
  const terminalAt = run.completedAt ?? run.failedAt ?? run.cancelledAt
  return {
    status: run.status,
    statusLabel: runStatusLabel(run.status),
    role: run.role ?? 'unknown',
    roleLabel: runRoleLabel(run.role),
    createdAt: run.createdAt,
    ...(run.startedAt ? { startedAt: run.startedAt } : {}),
    ...(terminalAt ? { terminalAt } : {}),
    warningCount: run.warnings?.length ?? 0,
    pendingApprovals: run.pendingApprovals?.filter((approval) => approval.status === 'pending').length ?? 0,
    pendingInputs: run.pendingInputRequests?.filter((request) => request.status === 'pending').length ?? 0,
  }
}

function modelCallStatusLabel(status: AgentModelCallSummary['status']): string {
  switch (status) {
    case 'complete': return '请求和响应完整'
    case 'request_only': return '缺少 HTTP 响应'
    case 'response_only': return '缺少请求事件'
    case 'result_only': return '只有模型结果'
    case 'failed': return '模型请求失败'
  }
}

function modelCallIssue(status: AgentModelCallSummary['status']): string | undefined {
  switch (status) {
    case 'request_only': return '这次调用只看到 HTTP 请求，没有看到 HTTP 回复。服务端已使用全量 trace 计算，如果仍缺失，通常是请求被取消、异常中断或采集缺口。'
    case 'response_only': return '这次调用有 HTTP 回复，但全量 trace 里没有对应请求上下文。'
    case 'result_only': return '这条记录只是模型输出汇总，不是底层 HTTP 传输。'
    case 'failed': return '模型 HTTP 调用失败。请查看错误事件、相邻重试记录，以及是否保存了失败响应正文。'
    default: return undefined
  }
}

function skillTraceTitle(eventType: string | undefined, fallback: string): string {
  switch (eventType) {
    case 'skill.state_resolved': return '技能上下文已解析'
    case 'skill.state_requested': return '技能状态变更请求'
    default: return fallback
  }
}

function runStatusLabel(status: AgentRun['status']): string {
  switch (status) {
    case 'queued': return '排队中'
    case 'in_progress': return '运行中'
    case 'requires_action': return '等待处理'
    case 'completed': return '已完成'
    case 'completed_with_warnings': return '完成但有警告'
    case 'failed': return '失败'
    case 'cancelled': return '已取消'
  }
}

function runRoleLabel(role: AgentRun['role'] | undefined): string {
  switch (role) {
    case 'planner': return '规划器'
    case 'worker': return '执行器'
    default: return '-'
  }
}

function traceKindLabel(kind: AgentTraceEvent['kind']): string {
  switch (kind) {
    case 'run': return '运行'
    case 'thread': return '线程'
    case 'message': return '消息'
    case 'context': return '上下文'
    case 'memory': return '记忆'
    case 'manifest': return '配置'
    case 'skill': return '技能'
    case 'tool_catalog': return '工具目录'
    case 'prompt': return '提示词'
    case 'policy': return '策略'
    case 'reasoning': return '推理'
    case 'tool_call': return '工具调用'
    case 'model_call': return '模型调用'
    case 'approval': return '审批'
    case 'input': return '输入'
    case 'assistant': return '助手'
    case 'task': return '任务'
    case 'plan': return '计划'
    case 'error': return '错误'
  }
}

function traceEventStatusLabel(status: AgentTraceEvent['status']): string {
  switch (status) {
    case 'started': return '已开始'
    case 'completed': return '已完成'
    case 'blocked': return '被阻塞'
    case 'failed': return '失败'
    case 'info': return '信息'
  }
}

function localizedTraceTitle(event: AgentTraceEvent): string {
  if (event.kind === 'input') return '等待用户补充信息'
  if (event.kind === 'approval') return '等待用户审批'
  if (event.kind === 'model_call' && event.title === 'Model HTTP call failed') return '模型请求失败'
  if (event.kind === 'tool_call' && event.title.startsWith('Tool call failed:')) return `工具失败：${event.toolName ?? event.title.replace(/^Tool call failed:\s*/, '')}`
  return event.title
}

function traceBehavior(event: AgentTraceEvent): string | undefined {
  if (event.kind === 'model_call') return '执行模型调用链路'
  if (event.kind === 'tool_call' && event.toolName) return `调用 ${event.toolName}`
  if (event.kind === 'approval') return '运行暂停等待审批'
  if (event.kind === 'input') return '运行暂停等待用户补充信息'
  return undefined
}

function traceImpact(event: AgentTraceEvent): string | undefined {
  if (event.kind === 'approval' || event.kind === 'input') return '运行暂停，等待用户处理后继续'
  if (event.kind === 'tool_call' && event.status === 'failed') return '本次工具没有成功，错误会反馈给模型或用户'
  return undefined
}

function promptPartGroups(parts: AgentPromptDetailView['parts']): AgentPromptDetailView['partGroups'] {
  const groups = new Map<string, { contextLayer: string; count: number; chars: number; partIds: string[] }>()
  for (const part of parts) {
    const key = part.contextLayer ?? '未分类'
    const group = groups.get(key) ?? { contextLayer: key, count: 0, chars: 0, partIds: [] }
    group.count += 1
    group.chars += Number(part.chars ?? 0) || 0
    group.partIds.push(part.id)
    groups.set(key, group)
  }
  return Array.from(groups.values())
    .sort((left, right) => right.chars - left.chars || left.contextLayer.localeCompare(right.contextLayer))
    .map((group) => ({
      contextLayer: group.contextLayer,
      count: group.count,
      chars: String(group.chars),
      partIds: group.partIds,
    }))
}

function metricEntries(record: Record<string, unknown> | undefined, labeler: (value: string | undefined) => string | undefined): Array<{ label: string; value: string }> {
  if (!record) return []
  return Object.entries(record)
    .flatMap(([key, value]) => {
      const number = numberValue(value)
      if (number === undefined) return []
      return [{ label: labeler(key) ?? key, value: String(number) }]
    })
    .sort((left, right) => Number(right.value) - Number(left.value))
}

function localizedPromptLayer(layer: string | undefined): string | undefined {
  switch (layer) {
    case 'level0_core': return '核心契约'
    case 'level1_context': return '上下文'
    case 'level2_behavior': return '行为约束'
    case 'runtime_warnings': return '运行警告'
    default: return layer
  }
}

function localizedPromptContextLayer(layer: string | undefined): string | undefined {
  switch (layer) {
    case 'runtime_contract': return '运行契约'
    case 'focus': return '页面焦点'
    case 'behavior': return '行为策略'
    case 'retrieved': return '检索上下文'
    case 'thread_continuity': return '线程连续性'
    case 'warning': return '警告'
    case 'tool_result': return '工具结果'
    case 'memory': return '记忆'
    case 'knowledge': return '知识'
    default: return layer
  }
}

function firstNumber(value: string): number {
  return Number(value.match(/\d+/)?.[0] ?? 0)
}

function slashNumbers(value: string): [number, number] {
  const match = value.match(/(\d+)\s*\/\s*(\d+)/)
  return [Number(match?.[1] ?? 0), Number(match?.[2] ?? 0)]
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function arrayValue(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()))).sort()
}

function formatMs(value: number | undefined): string | undefined {
  return value === undefined ? undefined : `${Math.round(value)}ms`
}

function formatTimestamp(value: string): string {
  return value
}

function previewText(value: string, limit = 180): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}...` : normalized
}

function previewJSON(value: unknown): string {
  try {
    return previewText(JSON.stringify(value, null, 2), 1000)
  } catch {
    return previewText(String(value), 1000)
  }
}
