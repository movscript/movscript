import type { AgentRun, AgentRunStatus, AgentTraceEvent } from './types.js'

export const RUN_DEBUG_LEDGER_MAX_CHARS = 32_000
const MAX_MODEL_CALLS = 12
const MAX_TOOL_CALLS = 30
const MAX_ATTENTION_ITEMS = 20
const MAX_DECISIONS = 20
const MAX_EVIDENCE_REFS = 60
const MAX_DROPPED_SAMPLES = 12
const MAX_LAYER_ITEMS = 16
const MAX_PREVIEW_CHARS = 400

export interface AgentRunDebugLedger {
  schema: 'movscript.agent.run-debug-ledger.v1'
  runId: string
  generatedAt: string
  budget: {
    maxChars: number
    estimatedChars: number
    truncated: boolean
  }
  run: {
    status: AgentRunStatus
    role?: AgentRun['role']
    objective?: string
    currentRound?: number
    error?: string
    warnings: string[]
  }
  context: {
    promptChars?: number
    messageCount?: number
    systemMessageCount?: number
    activeSkillIds: string[]
    availableToolNames: string[]
    blockedToolCount?: number
    droppedSummary: {
      count: number
      totalOriginalChars: number
      totalRenderedChars: number
      samples: Array<{ eventId: string; originalChars: number; renderedChars: number; reason?: string }>
    }
    layers: Array<{ label: string; chars: number }>
  }
  modelCalls: AgentRunDebugLedgerModelCall[]
  toolCalls: AgentRunDebugLedgerToolCall[]
  decisions: AgentRunDebugLedgerDecision[]
  attention: AgentRunDebugLedgerAttentionItem[]
  evidenceIndex: AgentRunDebugLedgerEvidenceRef[]
}

export interface AgentRunDebugLedgerModelCall {
  callId: string
  roundIndex?: number
  status: 'request_only' | 'complete' | 'failed' | 'result_only'
  model?: string
  messageCount?: number
  toolCount?: number
  httpStatus?: number
  latencyMs?: number
  inputTokens?: number
  outputTokens?: number
  responseChars?: number
  retryCount?: number
  evidenceRefs: string[]
  issue?: string
}

export interface AgentRunDebugLedgerToolCall {
  eventId: string
  roundIndex?: number
  toolName: string
  status: AgentTraceEvent['status']
  durationMs?: number
  summary?: string
  resultEvidenceRef?: string
  issue?: string
}

export interface AgentRunDebugLedgerDecision {
  eventId: string
  kind: 'policy' | 'approval' | 'input' | 'skill' | 'context'
  summary: string
  impact?: string
}

export interface AgentRunDebugLedgerAttentionItem {
  eventId: string
  severity: 'info' | 'warning' | 'error' | 'blocked'
  title: string
  summary?: string
  nextAction?: string
}

export interface AgentRunDebugLedgerEvidenceRef {
  evidenceId: string
  eventId: string
  kind: 'model_request' | 'model_response' | 'tool_result' | 'raw_event'
  label: string
  chars: number
  preview: string
  fetchPath: string
}

export interface AgentRunDebugEvidence {
  schema: 'movscript.agent.run-debug-evidence.v1'
  runId: string
  evidenceId: string
  eventId: string
  kind: AgentRunDebugLedgerEvidenceRef['kind']
  chars: number
  value: unknown
}

export function createRunDebugLedger(run: AgentRun, generatedAt = new Date().toISOString()): AgentRunDebugLedger {
  return compactRunDebugLedger({
    schema: 'movscript.agent.run-debug-ledger.v1',
    runId: run.id,
    generatedAt,
    budget: {
      maxChars: RUN_DEBUG_LEDGER_MAX_CHARS,
      estimatedChars: 0,
      truncated: false,
    },
    run: {
      status: run.status,
      ...(run.role ? { role: run.role } : {}),
      ...(run.input?.userMessage ? { objective: previewText(run.input.userMessage, 800) } : {}),
      ...(run.error ? { error: previewText(run.error) } : {}),
      warnings: (run.warnings ?? []).map((warning) => previewText(warning, 240)).slice(0, 12),
    },
    context: {
      activeSkillIds: [],
      availableToolNames: [],
      droppedSummary: {
        count: 0,
        totalOriginalChars: 0,
        totalRenderedChars: 0,
        samples: [],
      },
      layers: [],
    },
    modelCalls: [],
    toolCalls: [],
    decisions: [],
    attention: [],
    evidenceIndex: [],
  })
}

export function applyTraceEventToDebugLedger(input: {
  ledger: AgentRunDebugLedger
  event: AgentTraceEvent
  run?: AgentRun
  maxChars?: number
}): AgentRunDebugLedger {
  const next: AgentRunDebugLedger = clone(input.ledger)
  next.generatedAt = input.event.createdAt
  next.run.currentRound = input.event.roundIndex ?? next.run.currentRound
  if (input.run) {
    next.run.status = input.run.status
    if (input.run.role) next.run.role = input.run.role
    if (input.run.input?.userMessage) next.run.objective = previewText(input.run.input.userMessage, 800)
    if (input.run.error) next.run.error = previewText(input.run.error)
    next.run.warnings = (input.run.warnings ?? next.run.warnings).map((warning) => previewText(warning, 240)).slice(0, 12)
  }

  const data = recordValue(input.event.data)
  const eventType = stringValue(data?.eventType) ?? stringValue(data?.contextEventType)
  if (input.event.kind === 'prompt') applyPromptEvent(next, input.event, data)
  if (eventType === 'context.item_dropped') applyDroppedContextEvent(next, input.event, data)
  if (eventType === 'context.ledger_updated' || eventType === 'context.run_built') {
    addDecision(next, {
      eventId: input.event.id,
      kind: 'context',
      summary: input.event.summary ?? input.event.title,
      impact: eventType === 'context.ledger_updated' ? '更新后续模型轮次可引用的上下文索引。' : '建立本轮运行输入快照。',
    })
  }
  if (input.event.kind === 'model_call') applyModelCallEvent(next, input.event, data)
  if (input.event.kind === 'tool_call') applyToolCallEvent(next, input.event, data)
  if (input.event.kind === 'policy') {
    addDecision(next, {
      eventId: input.event.id,
      kind: 'policy',
      summary: input.event.summary ?? input.event.title,
      impact: input.event.status === 'blocked' ? '工具执行被策略阻塞或需要审批。' : '工具执行策略已判定。',
    })
  }
  if (input.event.kind === 'approval' || input.event.kind === 'input') {
    addDecision(next, {
      eventId: input.event.id,
      kind: input.event.kind,
      summary: input.event.summary ?? input.event.title,
      impact: '运行暂停，等待外部动作后继续。',
    })
  }
  if (input.event.kind === 'skill') {
    addDecision(next, {
      eventId: input.event.id,
      kind: 'skill',
      summary: input.event.summary ?? input.event.title,
    })
  }
  if (input.event.status === 'failed' || input.event.status === 'blocked' || input.event.kind === 'error') {
    addAttention(next, {
      eventId: input.event.id,
      severity: input.event.status === 'blocked' ? 'blocked' : 'error',
      title: input.event.title,
      ...(input.event.summary ? { summary: previewText(input.event.summary) } : {}),
      nextAction: nextActionForAttention(input.event),
    })
  }

  return compactRunDebugLedger(next, input.maxChars)
}

export function compactRunDebugLedger(ledger: AgentRunDebugLedger, maxChars = RUN_DEBUG_LEDGER_MAX_CHARS): AgentRunDebugLedger {
  const next: AgentRunDebugLedger = clone(ledger)
  const budget = Math.max(1_000, Math.floor(maxChars))
  next.budget.maxChars = budget
  next.context.activeSkillIds = uniqueStrings(next.context.activeSkillIds).slice(0, 30)
  next.context.availableToolNames = uniqueStrings(next.context.availableToolNames).slice(0, 50)
  next.context.layers = next.context.layers
    .filter((layer) => Number.isFinite(layer.chars) && layer.chars > 0)
    .sort((left, right) => right.chars - left.chars)
    .slice(0, MAX_LAYER_ITEMS)
  next.context.droppedSummary.samples = next.context.droppedSummary.samples.slice(-MAX_DROPPED_SAMPLES)
  next.modelCalls = trimModelCalls(next.modelCalls)
  next.toolCalls = trimToolCalls(next.toolCalls)
  next.decisions = next.decisions.slice(-MAX_DECISIONS)
  next.attention = trimAttention(next.attention)
  next.evidenceIndex = next.evidenceIndex.slice(-MAX_EVIDENCE_REFS)
    .map((item) => ({ ...item, preview: previewText(item.preview, MAX_PREVIEW_CHARS) }))

  let truncated = ledger.budget.truncated
  while (jsonLength(next) > budget) {
    truncated = true
    if (shrinkPreviews(next)) continue
    if (next.evidenceIndex.length > 12) {
      next.evidenceIndex = next.evidenceIndex.slice(-Math.max(12, Math.floor(next.evidenceIndex.length * 0.75)))
      continue
    }
    if (next.toolCalls.length > 8) {
      next.toolCalls = next.toolCalls.slice(-Math.max(8, Math.floor(next.toolCalls.length * 0.75)))
      continue
    }
    if (next.modelCalls.length > 6) {
      next.modelCalls = next.modelCalls.slice(-Math.max(6, Math.floor(next.modelCalls.length * 0.75)))
      continue
    }
    if (next.decisions.length > 6) {
      next.decisions = next.decisions.slice(-Math.max(6, Math.floor(next.decisions.length * 0.75)))
      continue
    }
    if (next.attention.length > 6) {
      next.attention = next.attention.slice(-Math.max(6, Math.floor(next.attention.length * 0.75)))
      continue
    }
    if (next.context.droppedSummary.samples.length > 3) {
      next.context.droppedSummary.samples = next.context.droppedSummary.samples.slice(-3)
      continue
    }
    next.evidenceIndex = []
    next.decisions = next.decisions.slice(-3)
    next.toolCalls = next.toolCalls.slice(-3)
    next.modelCalls = next.modelCalls.slice(-3)
    next.attention = next.attention.slice(-3)
    break
  }
  next.budget.truncated = truncated
  next.budget.estimatedChars = jsonLength(next)
  return next
}

export function buildRunDebugLedgerFromTrace(input: {
  run: AgentRun
  events: AgentTraceEvent[]
  generatedAt?: string
  maxChars?: number
}): AgentRunDebugLedger {
  let ledger = createRunDebugLedger(input.run, input.generatedAt)
  for (const event of [...input.events].sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
    ledger = applyTraceEventToDebugLedger({ ledger, event, run: input.run, maxChars: input.maxChars })
  }
  return compactRunDebugLedger(ledger, input.maxChars)
}

export function resolveRunDebugEvidence(input: {
  runId: string
  events: AgentTraceEvent[]
  evidenceId: string
}): AgentRunDebugEvidence | undefined {
  const parsed = parseEvidenceId(input.evidenceId)
  if (!parsed) return undefined
  const event = input.events.find((item) => item.id === parsed.eventId)
  if (!event) return undefined
  const data = recordValue(event.data)
  let value: unknown
  switch (parsed.kind) {
    case 'model_request':
      value = recordValue(data?.request)?.body ?? recordValue(data?.body) ?? data
      break
    case 'model_response':
      value = recordValue(data?.response) ?? data
      break
    case 'tool_result':
      value = data?.result ?? data
      break
    case 'raw_event':
      value = event
      break
  }
  return {
    schema: 'movscript.agent.run-debug-evidence.v1',
    runId: input.runId,
    evidenceId: input.evidenceId,
    eventId: event.id,
    kind: parsed.kind,
    chars: jsonLength(value),
    value,
  }
}

function applyPromptEvent(ledger: AgentRunDebugLedger, event: AgentTraceEvent, data: Record<string, unknown> | undefined): void {
  const promptStats = recordValue(data?.promptStats)
  ledger.context.promptChars = numberValue(promptStats?.totalChars) ?? numberValue(data?.charCount) ?? ledger.context.promptChars
  ledger.context.messageCount = numberValue(data?.messageCount) ?? ledger.context.messageCount
  ledger.context.systemMessageCount = numberValue(data?.systemMessageCount) ?? ledger.context.systemMessageCount
  ledger.context.blockedToolCount = numberValue(data?.blockedToolCount) ?? ledger.context.blockedToolCount
  ledger.context.activeSkillIds = uniqueStrings([...ledger.context.activeSkillIds, ...stringList(data?.skillIds)])
  ledger.context.availableToolNames = uniqueStrings([...ledger.context.availableToolNames, ...stringList(data?.availableToolNames)])
  const byContextLayer = recordValue(promptStats?.byContextLayer) ?? recordValue(promptStats?.byLayer)
  if (byContextLayer) {
    const merged = new Map(ledger.context.layers.map((layer) => [layer.label, layer.chars]))
    for (const [label, value] of Object.entries(byContextLayer)) {
      const chars = numberValue(value)
      if (chars !== undefined) merged.set(label, chars)
    }
    ledger.context.layers = Array.from(merged.entries()).map(([label, chars]) => ({ label, chars }))
  }
  addDecision(ledger, {
    eventId: event.id,
    kind: 'context',
    summary: event.summary ?? '模型上下文已组装。',
    impact: `本轮模型输入约 ${ledger.context.promptChars ?? 0} 字符，${ledger.context.messageCount ?? 0} 条消息。`,
  })
}

function applyDroppedContextEvent(ledger: AgentRunDebugLedger, event: AgentTraceEvent, data: Record<string, unknown> | undefined): void {
  const originalChars = numberValue(data?.originalChars) ?? 0
  const renderedChars = numberValue(data?.renderedChars) ?? 0
  ledger.context.droppedSummary.count += 1
  ledger.context.droppedSummary.totalOriginalChars += originalChars
  ledger.context.droppedSummary.totalRenderedChars += renderedChars
  ledger.context.droppedSummary.samples.push({
    eventId: event.id,
    originalChars,
    renderedChars,
    ...(stringValue(data?.reason) ? { reason: stringValue(data?.reason) } : {}),
  })
}

function applyModelCallEvent(ledger: AgentRunDebugLedger, event: AgentTraceEvent, data: Record<string, unknown> | undefined): void {
  const phase = stringValue(data?.phase)
  const requestBody = recordValue(recordValue(data?.request)?.body)
  const response = recordValue(data?.response)
  const usage = recordValue(data?.usage) ?? recordValue(recordValue(response?.parsedBody)?.usage)
  const call = phase === 'request'
    ? createModelCall(event, requestBody)
    : findModelCallForEvent(ledger, event) ?? createModelCall(event, requestBody)

  if (phase === 'request') {
    upsertModelCall(ledger, call)
    addEvidence(ledger, buildEvidenceRef({
      event,
      kind: 'model_request',
      label: '模型请求负载',
      value: requestBody ?? data,
    }))
    return
  }

  if (phase === 'response' || response) {
    call.status = response ? 'complete' : call.status
    const status = numberValue(response?.status)
    if (status !== undefined) call.httpStatus = status
    const latencyMs = numberValue(data?.latencyMs)
    if (latencyMs !== undefined) call.latencyMs = latencyMs
    const bodyText = stringValue(response?.bodyText)
    call.responseChars = stringValue(response?.content)?.length ?? bodyText?.length ?? call.responseChars
    const inputTokens = numberValue(usage?.input_tokens) ?? numberValue(usage?.prompt_tokens)
    const outputTokens = numberValue(usage?.output_tokens) ?? numberValue(usage?.completion_tokens)
    if (inputTokens !== undefined) call.inputTokens = inputTokens
    if (outputTokens !== undefined) call.outputTokens = outputTokens
    addEvidence(ledger, buildEvidenceRef({
      event,
      kind: 'model_response',
      label: '模型响应正文',
      value: response ?? data,
    }))
    addEvidenceRefToCall(call, evidenceId(event, 'model_response'))
    upsertModelCall(ledger, call)
    return
  }

  if (phase === 'retry') {
    call.retryCount = (call.retryCount ?? 0) + 1
    upsertModelCall(ledger, call)
    addAttention(ledger, {
      eventId: event.id,
      severity: 'warning',
      title: event.title,
      summary: previewText(event.summary ?? '模型请求正在重试。'),
      nextAction: '检查模型网关限流、临时不可用或上游 5xx。',
    })
    return
  }

  if (phase === 'error' || event.status === 'failed') {
    call.status = 'failed'
    call.issue = previewText(stringValue(data?.error) ?? event.summary ?? '模型调用失败。')
    upsertModelCall(ledger, call)
    return
  }

  if (data?.finish_reason !== undefined || data?.content_chars !== undefined) {
    call.status = call.status === 'request_only' ? 'result_only' : call.status
    const responseChars = numberValue(data.content_chars)
    if (responseChars !== undefined) call.responseChars = responseChars
    const resultUsage = recordValue(data.usage)
    const inputTokens = numberValue(resultUsage?.input_tokens)
    const outputTokens = numberValue(resultUsage?.output_tokens)
    if (inputTokens !== undefined) call.inputTokens = inputTokens
    if (outputTokens !== undefined) call.outputTokens = outputTokens
    upsertModelCall(ledger, call)
  }
}

function applyToolCallEvent(ledger: AgentRunDebugLedger, event: AgentTraceEvent, data: Record<string, unknown> | undefined): void {
  const toolName = event.toolName ?? stringValue(data?.toolName) ?? event.title.replace(/^Tool (?:completed|call failed):\s*/, '')
  const resultRef = data?.result !== undefined ? evidenceId(event, 'tool_result') : undefined
  const view: AgentRunDebugLedgerToolCall = {
    eventId: event.id,
    ...(event.roundIndex !== undefined ? { roundIndex: event.roundIndex } : {}),
    toolName,
    status: event.status,
    ...(numberValue(data?.durationMs) ?? event.durationMs ? { durationMs: numberValue(data?.durationMs) ?? event.durationMs } : {}),
    ...(event.summary ? { summary: previewText(event.summary) } : {}),
    ...(resultRef ? { resultEvidenceRef: resultRef } : {}),
    ...(event.status === 'failed' ? { issue: previewText(stringValue(data?.error) ?? event.summary ?? '工具调用失败。') } : {}),
  }
  ledger.toolCalls = [...ledger.toolCalls.filter((item) => item.eventId !== event.id), view]
  if (data?.result !== undefined) {
    addEvidence(ledger, buildEvidenceRef({
      event,
      kind: 'tool_result',
      label: `工具结果：${toolName}`,
      value: data.result,
    }))
  }
}

function createModelCall(event: AgentTraceEvent, requestBody: Record<string, unknown> | undefined): AgentRunDebugLedgerModelCall {
  const messages = Array.isArray(requestBody?.messages) ? requestBody.messages : undefined
  const tools = Array.isArray(requestBody?.tools) ? requestBody.tools : undefined
  return {
    callId: event.id,
    ...(event.roundIndex !== undefined ? { roundIndex: event.roundIndex } : {}),
    status: 'request_only',
    ...(stringValue(requestBody?.model) ? { model: stringValue(requestBody?.model) } : {}),
    ...(messages ? { messageCount: messages.length } : {}),
    ...(tools ? { toolCount: tools.length } : {}),
    evidenceRefs: [evidenceId(event, 'model_request')],
  }
}

function findModelCallForEvent(ledger: AgentRunDebugLedger, event: AgentTraceEvent): AgentRunDebugLedgerModelCall | undefined {
  return [...ledger.modelCalls].reverse().find((call) => call.roundIndex === event.roundIndex && call.status !== 'complete' && call.status !== 'failed')
    ?? [...ledger.modelCalls].reverse().find((call) => call.roundIndex === event.roundIndex)
}

function upsertModelCall(ledger: AgentRunDebugLedger, call: AgentRunDebugLedgerModelCall): void {
  ledger.modelCalls = [...ledger.modelCalls.filter((item) => item.callId !== call.callId), {
    ...call,
    evidenceRefs: uniqueStrings(call.evidenceRefs),
  }]
}

function addEvidenceRefToCall(call: AgentRunDebugLedgerModelCall, ref: string): void {
  call.evidenceRefs = uniqueStrings([...call.evidenceRefs, ref])
}

function addEvidence(ledger: AgentRunDebugLedger, ref: AgentRunDebugLedgerEvidenceRef): void {
  ledger.evidenceIndex = [...ledger.evidenceIndex.filter((item) => item.evidenceId !== ref.evidenceId), ref]
}

function buildEvidenceRef(input: {
  event: AgentTraceEvent
  kind: AgentRunDebugLedgerEvidenceRef['kind']
  label: string
  value: unknown
}): AgentRunDebugLedgerEvidenceRef {
  return {
    evidenceId: evidenceId(input.event, input.kind),
    eventId: input.event.id,
    kind: input.kind,
    label: input.label,
    chars: jsonLength(input.value),
    preview: previewJSON(input.value),
    fetchPath: `/runs/${encodeURIComponent(input.event.runId)}/debug-evidence/${encodeURIComponent(evidenceId(input.event, input.kind))}`,
  }
}

function evidenceId(event: AgentTraceEvent, kind: AgentRunDebugLedgerEvidenceRef['kind']): string {
  return `${event.id}:${kind}`
}

function parseEvidenceId(value: string): { eventId: string; kind: AgentRunDebugLedgerEvidenceRef['kind'] } | undefined {
  const index = value.lastIndexOf(':')
  if (index <= 0) return undefined
  const eventId = value.slice(0, index)
  const kind = value.slice(index + 1)
  if (kind !== 'model_request' && kind !== 'model_response' && kind !== 'tool_result' && kind !== 'raw_event') return undefined
  return { eventId, kind }
}

function addDecision(ledger: AgentRunDebugLedger, decision: AgentRunDebugLedgerDecision): void {
  ledger.decisions = [...ledger.decisions.filter((item) => item.eventId !== decision.eventId), {
    ...decision,
    summary: previewText(decision.summary),
    ...(decision.impact ? { impact: previewText(decision.impact) } : {}),
  }]
}

function addAttention(ledger: AgentRunDebugLedger, item: AgentRunDebugLedgerAttentionItem): void {
  ledger.attention = [...ledger.attention.filter((entry) => entry.eventId !== item.eventId), {
    ...item,
    title: previewText(item.title, 160),
    ...(item.summary ? { summary: previewText(item.summary) } : {}),
  }]
}

function trimModelCalls(calls: AgentRunDebugLedgerModelCall[]): AgentRunDebugLedgerModelCall[] {
  const failed = calls.filter((call) => call.status === 'failed').slice(-6)
  const recent = calls.slice(-MAX_MODEL_CALLS)
  return uniqueBy([...failed, ...recent], (call) => call.callId).slice(-MAX_MODEL_CALLS)
}

function trimToolCalls(calls: AgentRunDebugLedgerToolCall[]): AgentRunDebugLedgerToolCall[] {
  const failed = calls.filter((call) => call.status === 'failed').slice(-10)
  const slow = [...calls].filter((call) => typeof call.durationMs === 'number').sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0)).slice(0, 8)
  const recent = calls.slice(-MAX_TOOL_CALLS)
  return uniqueBy([...failed, ...slow, ...recent], (call) => call.eventId).slice(-MAX_TOOL_CALLS)
}

function trimAttention(items: AgentRunDebugLedgerAttentionItem[]): AgentRunDebugLedgerAttentionItem[] {
  const severityRank = { error: 0, blocked: 1, warning: 2, info: 3 }
  return [...items]
    .sort((left, right) => severityRank[left.severity] - severityRank[right.severity])
    .slice(0, MAX_ATTENTION_ITEMS)
}

function shrinkPreviews(ledger: AgentRunDebugLedger): boolean {
  let changed = false
  for (const item of ledger.evidenceIndex) {
    if (item.preview.length > 120) {
      item.preview = previewText(item.preview, 120)
      changed = true
    }
  }
  for (const call of ledger.toolCalls) {
    if (call.summary && call.summary.length > 120) {
      call.summary = previewText(call.summary, 120)
      changed = true
    }
  }
  for (const item of ledger.attention) {
    if (item.summary && item.summary.length > 120) {
      item.summary = previewText(item.summary, 120)
      changed = true
    }
  }
  return changed
}

function nextActionForAttention(event: AgentTraceEvent): string {
  if (event.kind === 'approval') return '处理待审批工具调用。'
  if (event.kind === 'input') return '补充运行所需输入。'
  if (event.kind === 'model_call') return '检查模型请求、响应和重试证据。'
  if (event.kind === 'tool_call') return '检查工具输入、结果和错误摘要。'
  return '查看关联 trace event 和 evidence。'
}

function previewJSON(value: unknown): string {
  try {
    return previewText(JSON.stringify(value), MAX_PREVIEW_CHARS)
  } catch {
    return previewText(String(value), MAX_PREVIEW_CHARS)
  }
}

function previewText(value: string, maxChars = MAX_PREVIEW_CHARS): string {
  if (value.length <= maxChars) return value
  return `${value.slice(0, Math.max(0, maxChars - 24))}... [truncated]`
}

function jsonLength(value: unknown): number {
  try {
    return JSON.stringify(value).length
  } catch {
    return String(value).length
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : []
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)))
}

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const value of values) {
    const id = key(value)
    if (seen.has(id)) continue
    seen.add(id)
    out.push(value)
  }
  return out
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
