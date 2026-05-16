import type { AgentApprovalRequest, AgentRun, AgentTraceEvent } from './localAgentClient'

export type AgentTraceCategory = 'context' | 'action' | 'impact' | 'http' | 'decision' | 'attention'

export interface AgentTraceView {
  category: AgentTraceCategory
  categoryLabel: string
  title: string
  summary?: string
  behavior?: string
  impact?: string
  contextGroups: AgentTraceContextGroup[]
  promptDetail?: AgentTracePromptDetail
  modelDetail?: AgentTraceModelDetail
  messageDetail?: AgentTraceMessageDetail
}

export interface AgentTraceContextGroup {
  label: string
  items: Array<{ label: string; value: string }>
}

export interface AgentTraceModelDetail {
  kind: 'request' | 'http' | 'result'
  title: string
  note?: string
  request?: {
    method?: string
    url?: string
    model?: string
    messageCount?: string
    toolCount?: string
    toolChoice?: string
    toolChoiceLabel?: string
    stream?: string
  }
  messages: AgentTraceModelMessageDetail[]
  tools: AgentTraceModelToolDetail[]
  response?: {
    status?: string
    contentType?: string
    content?: string
    bodyText?: string
    parsedId?: string
  }
  result?: {
    finishReason?: string
    finishReasonLabel?: string
    contentChars?: string
    inputTokens?: string
    outputTokens?: string
    toolCalls?: string
  }
}

export interface AgentTraceModelMessageDetail {
  index: number
  role: string
  roleLabel: string
  content: string
  contentChars: number
}

export interface AgentTraceModelToolDetail {
  index: number
  name: string
  description?: string
  parameterKeys: string[]
}

export interface AgentTraceMessageDetail {
  title: string
  messageId?: string
  source?: string
  sourceLabel?: string
  content: string
  contentChars: number
}

export interface AgentTracePromptDetail {
  title: string
  totalChars?: string
  messageCount?: string
  systemMessageCount?: string
  blockedToolCount?: string
  skills: string[]
  tools: string[]
  layers: AgentTracePromptMetric[]
  contextLayers: AgentTracePromptMetric[]
  parts: AgentTracePromptPart[]
}

export interface AgentTracePromptMetric {
  label: string
  value: string
}

export interface AgentTracePromptPart {
  id: string
  layer?: string
  contextLayer?: string
  chars?: string
}

export interface AgentModelCallSummary {
  id: string
  label: string
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
}

export interface AgentDebugCoverageSummary {
  loadedLabel: string
  hasUnloadedTrace: boolean
  modelCallsLabel: string
  promptDetailsLabel: string
  messageWritesLabel: string
  httpResponsesLabel: string
  issues: string[]
}

export interface AgentDebugReportInput {
  runId: string
  coverage: AgentDebugCoverageSummary
  modelCalls: AgentModelCallSummary[]
  events: AgentTraceEvent[]
}

export function traceEventIdFromHash(hash: string | undefined): string | undefined {
  if (!hash?.startsWith('#event-')) return undefined
  const eventId = decodeURIComponent(hash.replace(/^#event-/, ''))
  return eventId || undefined
}

export function traceDeepLinkMissing(input: {
  eventId?: string
  events: AgentTraceEvent[]
  hasMore: boolean
}): boolean {
  return !!input.eventId
    && input.events.length > 0
    && !input.hasMore
    && !input.events.some((event) => event.id === input.eventId)
}

export function buildTraceEventLink(input: {
  origin: string
  pathname: string
  search?: string
  eventId: string
}): string {
  return `${input.origin}${input.pathname}${input.search ?? ''}#event-${encodeURIComponent(input.eventId)}`
}

export function canCancelWorkerRun(run: Pick<AgentRun, 'role' | 'status'> | undefined): boolean {
  return run?.role === 'worker' && !isTerminalRunStatus(run.status)
}

export function traceKindLabel(kind: AgentTraceEvent['kind']): string {
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

export function traceCategoryLabel(category: AgentTraceCategory): string {
  switch (category) {
    case 'context': return '上下文'
    case 'action': return '行为'
    case 'impact': return '影响'
    case 'http': return 'HTTP'
    case 'decision': return '决策'
    case 'attention': return '需关注'
  }
}

export function runStatusLabel(status: AgentRun['status']): string {
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

export function runRoleLabel(role: AgentRun['role'] | undefined): string {
  switch (role) {
    case 'planner': return '规划器'
    case 'worker': return '执行器'
    default: return '-'
  }
}

export function traceEventStatusLabel(status: AgentTraceEvent['status']): string {
  switch (status) {
    case 'started': return '已开始'
    case 'completed': return '已完成'
    case 'blocked': return '被阻塞'
    case 'failed': return '失败'
    case 'info': return '信息'
  }
}

export function agentPlanStatusLabel(status: string): string {
  switch (status) {
    case 'pending': return '待开始'
    case 'running': return '运行中'
    case 'blocked': return '被阻塞'
    case 'needs_review': return '待审阅'
    case 'done': return '已完成'
    case 'failed': return '失败'
    case 'cancelled': return '已取消'
    default: return unknownLabel('计划状态', status)
  }
}

export function approvalRiskLabel(risk: string): string {
  switch (risk) {
    case 'low': return '低'
    case 'medium': return '中'
    case 'high': return '高'
    case 'critical': return '严重'
    case 'write': return '写入'
    case 'destructive': return '破坏性'
    default: return unknownLabel('风险', risk)
  }
}

export function approvalPermissionLabel(permission: string): string {
  switch (permission) {
    case 'read': return '读取'
    case 'write': return '写入'
    case 'execute': return '执行'
    case 'network': return '网络'
    case 'filesystem': return '文件系统'
    case 'shell': return '命令行'
    default: return businessPermissionLabel(permission) ?? unknownLabel('权限', permission)
  }
}

export function approvalStatusLabel(status: string | undefined): string {
  switch (status) {
    case 'pending': return '待处理'
    case 'approved': return '已同意'
    case 'rejected': return '已拒绝'
    case 'cancelled': return '已取消'
    case 'expired': return '已过期'
    default: return status ? unknownLabel('审批状态', status) : '-'
  }
}

export function agentPermissionModeLabel(mode: string | undefined): string {
  switch (mode) {
    case 'ask': return '每次询问'
    case 'suggest': return '建议后确认'
    case 'auto': return '自动执行'
    default: return mode ? unknownLabel('权限模式', mode) : '-'
  }
}

export function runApprovalModeLabel(mode: string | undefined): string {
  switch (mode) {
    case 'interactive': return '交互确认'
    case 'auto_readonly': return '只读自动'
    case 'auto': return '自动执行'
    default: return mode ? unknownLabel('审批模式', mode) : '-'
  }
}

export function toolApprovalLabel(approval: string | undefined): string {
  switch (approval) {
    case 'never': return '无需审批'
    case 'always': return '每次审批'
    case 'on_write': return '写入时审批'
    default: return approval ? unknownLabel('工具审批', approval) : '-'
  }
}

export function toolGrantModeLabel(mode: string | undefined): string {
  switch (mode) {
    case 'allow': return '允许'
    case 'deny': return '禁用'
    default: return mode ? unknownLabel('授权模式', mode) : '-'
  }
}

export function approvalImpactLabel(approval: Pick<AgentApprovalRequest, 'toolName' | 'risk' | 'permission' | 'preview'>): string {
  const previewSideEffect = approvalPreviewSideEffect(approval.preview)
  if (previewSideEffect) return `批准后会执行预览变更：${previewSideEffect}`

  switch (approval.toolName) {
    case 'movscript_create_generation_job': return '批准后会创建生成任务，可能消耗生成额度。'
    case 'movscript_cancel_generation_job': return '批准后会取消生成任务，未完成的输出可能不再产生。'
    case 'movscript_create_project': return '批准后会创建项目数据。'
    case 'movscript_create_script': return '批准后会写入剧本数据。'
    case 'movscript_delete_memory': return '批准后会删除记忆，后续运行将无法再引用它。'
    case 'movscript_reload_agent_catalog': return '批准后会重新加载 Agent 工具和技能目录。'
    case 'movscript_spawn_subagent': return '批准后会启动子代理执行分配任务。'
    case 'movscript_cancel_subagent': return '批准后会取消子代理及其后续执行。'
    default: break
  }

  const permission = approval.permission ?? ''
  if (permission.includes('generation')) return '批准后会影响生成任务。'
  if (permission.includes('project') && permission.includes('write')) return '批准后会写入项目数据。'
  if (permission.includes('draft') && permission.includes('write')) return '批准后会写入草稿数据。'
  if (permission.includes('memory') && permission.includes('write')) return '批准后会写入或更新记忆。'
  if (approval.risk === 'destructive') return '批准后可能执行不可逆操作。'
  if (approval.risk === 'write') return '批准后会执行写入类操作。'
  return '批准后本次运行会继续执行这个工具调用；拒绝则会阻止这次工具调用。'
}

export function inputTypeLabel(type: string): string {
  switch (type) {
    case 'choice': return '选择'
    case 'text': return '文本'
    case 'confirmation': return '确认'
    default: return unknownLabel('输入类型', type)
  }
}

function approvalPreviewSideEffect(preview: unknown): string | undefined {
  const previewRecord = recordValue(preview)
  const review = recordValue(previewRecord?.review)
  return stringValue(review?.sideEffect)
}

function isTerminalRunStatus(status: AgentRun['status']): boolean {
  return status === 'completed' || status === 'completed_with_warnings' || status === 'failed' || status === 'cancelled'
}

export function agentTraceView(event: AgentTraceEvent): AgentTraceView {
  const data = recordValue(event.data)
  const eventType = stringValue(data?.eventType) ?? stringValue(data?.contextEventType)
  const phase = stringValue(data?.phase)
  const category = traceCategory(event, eventType, phase)
  return {
    category,
    categoryLabel: traceCategoryLabel(category),
    title: traceTitle(event, eventType, phase),
    summary: traceSummary(event),
    behavior: traceBehavior(event, data, eventType, phase),
    impact: traceImpact(event, data, eventType),
    contextGroups: traceContextGroups(event, data, eventType, phase),
    promptDetail: tracePromptDetail(event, data),
    modelDetail: traceModelDetail(event, data),
    messageDetail: traceMessageDetail(event, data),
  }
}

export function buildDebugCoverageSummary(input: {
  events: AgentTraceEvent[]
  total?: number
  hasMore: boolean
  modelCalls: AgentModelCallSummary[]
}): AgentDebugCoverageSummary {
  const promptDetails = input.events.filter((event) => !!agentTraceView(event).promptDetail).length
  const messageWrites = input.events.filter((event) => !!agentTraceView(event).messageDetail).length
  const httpResponses = input.modelCalls.filter((call) => call.responseEventId).length
  const incompleteModelCalls = input.modelCalls.filter((call) => call.status !== 'complete')
  const hasUnloadedTrace = input.hasMore || (typeof input.total === 'number' && input.events.length < input.total)
  const issues = [
    hasUnloadedTrace ? '还有未加载运行事件，当前统计只覆盖已加载事件。' : undefined,
    incompleteModelCalls.length > 0 ? `${incompleteModelCalls.length} 次模型调用缺少请求或响应事件；请先加载全部事件，如果仍缺失，多半是旧运行或异常中断时没有采集到完整 HTTP 详情。` : undefined,
    input.events.length > 0 && promptDetails === 0 ? '当前已加载事件里没有模型上下文详情；可能是旧运行未记录上下文组成，或这批分页还没有加载到上下文组装事件（Prompt composed）。' : undefined,
  ].filter((issue): issue is string => !!issue)
  return {
    loadedLabel: typeof input.total === 'number' ? `${input.events.length} / ${input.total}` : `${input.events.length}`,
    hasUnloadedTrace,
    modelCallsLabel: `${input.modelCalls.length}`,
    promptDetailsLabel: `${promptDetails}`,
    messageWritesLabel: `${messageWrites}`,
    httpResponsesLabel: `${httpResponses}`,
    issues,
  }
}

export function buildDebugReportText(input: AgentDebugReportInput): string {
  const lines = [
    'AgentRun 调试摘要',
    `运行: ${input.runId}`,
    `事件: ${input.coverage.loadedLabel}`,
    `模型调用: ${input.coverage.modelCallsLabel}`,
    `HTTP 响应: ${input.coverage.httpResponsesLabel}`,
    `上下文详情: ${input.coverage.promptDetailsLabel}`,
    `历史写入: ${input.coverage.messageWritesLabel}`,
  ]
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
  const latestEvents = input.events.slice(-5)
  if (latestEvents.length > 0) {
    lines.push('', '最近事件:')
    for (const event of latestEvents) {
      const view = agentTraceView(event)
      const duration = formatReportDuration(event.createdAt, event.completedAt)
      lines.push(`- ${formatReportTimestamp(event.createdAt)} ${traceKindLabel(event.kind)} ${traceEventStatusLabel(event.status)}${duration ? `，耗时 ${duration}` : ''}: ${view.title}${view.summary ? ` - ${view.summary}` : ''}`)
    }
  }
  return `${lines.join('\n')}\n`
}

export function buildModelCallSummaries(events: AgentTraceEvent[]): AgentModelCallSummary[] {
  const groups: InternalModelCallGroup[] = []
  const groupsByRound = new Map<string, InternalModelCallGroup>()
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
      group = { id: roundKey ?? `model-call-${groups.length + 1}`, events: [], retries: [] }
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

  return groups.map((group, index) => modelCallSummaryFromGroup(group, index + 1))
}

function traceCategory(event: AgentTraceEvent, eventType?: string, phase?: string): AgentTraceCategory {
  if (event.status === 'failed' || event.status === 'blocked' || event.kind === 'approval' || event.kind === 'input') return 'attention'
  if (eventType === 'context.ledger_updated' || eventType === 'context.item_deduped' || event.title.includes('Context ledger') || event.title.includes('deduped')) return 'impact'
  if (event.kind === 'tool_call' && event.title.startsWith('Generation ')) return 'impact'
  if (event.kind === 'assistant' || event.kind === 'message') return 'impact'
  if (event.kind === 'model_call' && (phase === 'request' || phase === 'response' || phase === 'retry' || phase === 'error' || event.title.includes('HTTP'))) return 'http'
  if (event.kind === 'policy') return 'decision'
  if (event.kind === 'context' || event.kind === 'prompt' || event.kind === 'memory' || event.kind === 'tool_catalog' || event.kind === 'manifest' || event.kind === 'skill') return 'context'
  return 'action'
}

interface InternalModelCallGroup {
  id: string
  events: AgentTraceEvent[]
  retries: AgentTraceEvent[]
  request?: AgentTraceEvent
  response?: AgentTraceEvent
  result?: AgentTraceEvent
  error?: AgentTraceEvent
}

function modelCallSummaryFromGroup(group: InternalModelCallGroup, index: number): AgentModelCallSummary {
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
    label: source?.roundLabel ?? `模型调用 ${index}`,
    status,
    statusLabel: modelCallStatusLabel(status),
    requestEventId: group.request?.id,
    responseEventId: group.response?.id,
    resultEventId: group.result?.id,
    model: stringValue(requestBody?.model) ?? stringValue(requestData?.model) ?? stringValue(recordValue(requestData?.config)?.model),
    messageCount: arrayValue(requestBody?.messages)?.length !== undefined ? String(arrayValue(requestBody?.messages)?.length) : undefined,
    toolCount: arrayValue(requestBody?.tools)?.length !== undefined ? String(arrayValue(requestBody?.tools)?.length) : undefined,
    httpStatus: numberValue(response?.status) !== undefined ? String(numberValue(response?.status)) : undefined,
    latency: formatMs(numberValue(responseData?.latencyMs) ?? numberValue(requestData?.latencyMs)),
    responseChars: responseChars !== undefined ? String(responseChars) : undefined,
    inputTokens: numberValue(usage?.input_tokens) !== undefined ? String(numberValue(usage?.input_tokens)) : undefined,
    outputTokens: numberValue(usage?.output_tokens) !== undefined ? String(numberValue(usage?.output_tokens)) : undefined,
    retryCount: group.retries.length > 0 ? String(group.retries.length) : undefined,
    error: stringValue(errorData?.error),
    issue: modelCallIssue(status),
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
    case 'request_only': return '这次调用只看到 HTTP 请求，还没有看到 HTTP 回复。请先加载全部事件；如果仍缺失，通常是请求被取消、异常中断、重试覆盖，或旧运行当时还没有采集响应正文。'
    case 'response_only': return '这次调用有 HTTP 回复，但当前已加载事件里没有对应请求上下文。请加载全部事件；如果仍缺失，通常是旧运行或采集升级前的数据。'
    case 'result_only': return '这条记录只是模型输出汇总，不是底层 HTTP 传输。要看请求消息、工具定义和原始回复，请打开同一轮的“请求”或“响应”事件。'
    case 'failed': return '模型 HTTP 调用失败。请查看错误事件、相邻重试记录，以及是否保存了失败响应正文。'
    default: return undefined
  }
}

function tracePromptDetail(event: AgentTraceEvent, data: Record<string, unknown> | undefined): AgentTracePromptDetail | undefined {
  if (event.kind !== 'prompt' || !data) return undefined
  const promptStats = recordValue(data.promptStats)
  const parts = arrayValue(promptStats?.parts)?.slice(0, 24).map((part, index) => {
    const record = recordValue(part)
    return {
      id: stringValue(record?.id) ?? `part_${index + 1}`,
      layer: localizedPromptLayer(stringValue(record?.layer)),
      contextLayer: localizedPromptContextLayer(stringValue(record?.contextLayer)),
      chars: numberValue(record?.chars) !== undefined ? String(numberValue(record?.chars)) : undefined,
    }
  }) ?? []
  const byLayer = metricEntries(recordValue(promptStats?.byLayer), localizedPromptLayer)
  const byContextLayer = metricEntries(recordValue(promptStats?.byContextLayer), localizedPromptContextLayer)
  const skills = arrayValue(data.skillIds)?.flatMap((item) => stringValue(item) ? [stringValue(item)!] : []) ?? []
  const tools = arrayValue(data.availableToolNames)?.flatMap((item) => stringValue(item) ? [stringValue(item)!] : []) ?? []
  if (!promptStats && skills.length === 0 && tools.length === 0) return undefined
  return {
    title: '模型上下文详情',
    totalChars: numberValue(promptStats?.totalChars) !== undefined ? String(numberValue(promptStats?.totalChars)) : numberValue(data.charCount) !== undefined ? String(numberValue(data.charCount)) : undefined,
    messageCount: numberValue(data.messageCount) !== undefined ? String(numberValue(data.messageCount)) : undefined,
    systemMessageCount: numberValue(data.systemMessageCount) !== undefined ? String(numberValue(data.systemMessageCount)) : undefined,
    blockedToolCount: numberValue(data.blockedToolCount) !== undefined ? String(numberValue(data.blockedToolCount)) : undefined,
    skills,
    tools,
    layers: byLayer,
    contextLayers: byContextLayer,
    parts,
  }
}

function metricEntries(record: Record<string, unknown> | undefined, labeler: (value: string | undefined) => string | undefined): AgentTracePromptMetric[] {
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
    case 'thread_continuity': return '线程连续性'
    case 'warning': return '警告'
    case 'tool_result': return '工具结果'
    case 'memory': return '记忆'
    case 'knowledge': return '知识'
    default: return layer
  }
}

function traceTitle(event: AgentTraceEvent, eventType?: string, phase?: string): string {
  if (event.kind === 'prompt') return '组装模型上下文'
  if (event.kind === 'context' && eventType === 'context.run_built') return '建立本轮运行上下文'
  if (event.kind === 'context' && eventType === 'context.ledger_updated') return '更新可引用上下文'
  if (event.kind === 'context' && eventType === 'context.item_deduped') return '合并重复上下文'
  if (event.kind === 'context' && eventType === 'context.item_dropped') return '压缩工具结果'
  if (event.title === 'Runtime context resolved') return '读取页面和项目焦点'
  if (event.kind === 'model_call' && phase === 'request') return '发起模型 HTTP 请求'
  if (event.kind === 'model_call' && phase === 'response') return '收到模型 HTTP 响应'
  if (event.kind === 'model_call' && event.title === 'Model HTTP response received') return hasModelHTTPResponse(event) ? '收到模型 HTTP 响应' : '汇总模型输出'
  if (event.kind === 'model_call' && phase === 'retry') return '模型请求重试'
  if (event.kind === 'model_call' && phase === 'error') return '模型请求失败'
  if (event.kind === 'model_call' && event.title === 'Model route selected') return '选择模型路由'
  if (event.kind === 'assistant' && event.title === 'Assistant message created') return '写入历史消息'
  if (event.kind === 'policy') return '判断工具调用权限'
  if (event.kind === 'tool_call' && event.title.startsWith('Tool completed:')) return `执行工具：${event.toolName ?? event.title.replace(/^Tool completed:\s*/, '')}`
  if (event.kind === 'tool_call' && event.title.startsWith('Tool call failed:')) return `工具失败：${event.toolName ?? event.title.replace(/^Tool call failed:\s*/, '')}`
  if (event.kind === 'tool_call' && event.title.startsWith('Generation ')) return '更新生成任务状态'
  if (event.kind === 'input') return '等待用户补充信息'
  if (event.kind === 'approval') return '等待用户审批'
  if (event.kind === 'tool_catalog') return '解析可用工具'
  if (event.kind === 'skill') return '激活技能'
  if (event.kind === 'manifest') return '解析 Agent 配置'
  const localizedTitle = localizedTraceTitle(event.title)
  if (localizedTitle) return localizedTitle
  return event.title
}

function traceSummary(event: AgentTraceEvent): string | undefined {
  if (!event.summary) return undefined
  const localizedSummary = localizedTraceSummary(event.summary)
  if (localizedSummary) return localizedSummary
  return event.summary.replace(/_/g, ' ')
}

function traceBehavior(event: AgentTraceEvent, data: Record<string, unknown> | undefined, eventType?: string, phase?: string): string | undefined {
  if (event.kind === 'prompt') {
    const charCount = numberValue(data?.charCount)
    const messageCount = numberValue(data?.messageCount)
    const skillCount = arrayValue(data?.skillIds)?.length
    return [`准备发送给模型`, charCount !== undefined ? `${charCount} 字符` : undefined, messageCount !== undefined ? `${messageCount} 条消息` : undefined, skillCount !== undefined ? `${skillCount} 个技能` : undefined].filter(Boolean).join('，')
  }
  if (event.kind === 'model_call' && phase === 'request') return '向模型网关发送请求'
  if (event.kind === 'model_call' && phase === 'response') return '解析模型网关返回结果'
  if (event.kind === 'model_call' && event.title === 'Model HTTP response received') return hasModelHTTPResponse(event) ? '解析模型网关返回结果' : '记录模型本轮输出摘要'
  if (event.kind === 'assistant' && event.title === 'Assistant message created') return '把最终回复保存为 assistant 消息'
  if (event.kind === 'tool_call' && event.toolName) return `调用 ${event.toolName}`
  if (event.kind === 'run' && event.title === 'Worker started') return '启动执行器运行，开始执行分配到的任务'
  if (event.kind === 'run' && event.title === 'Planner started') return '启动规划器运行，开始编排任务和子代理'
  if (event.kind === 'policy') return '根据 manifest、风险等级和审批模式判断是否允许工具执行'
  if (event.kind === 'context' && eventType === 'context.run_built') return '把页面焦点、技能、工具和记忆整理成本轮运行输入'
  return undefined
}

function traceImpact(event: AgentTraceEvent, data: Record<string, unknown> | undefined, eventType?: string): string | undefined {
  if (eventType === 'context.ledger_updated') {
    const retrieved = numberValue(data?.retrievedCount)
    const artifacts = numberValue(data?.artifactRefCount)
    return `上下文账本现在包含 ${retrieved ?? 0} 个引用、${artifacts ?? 0} 个产物引用`
  }
  if (eventType === 'context.item_deduped') {
    const count = numberValue(data?.dedupedCount)
    return `合并了 ${count ?? 0} 个重复引用，避免重复进入后续上下文`
  }
  if (eventType === 'context.item_dropped') {
    const original = numberValue(data?.originalChars)
    const rendered = numberValue(data?.renderedChars)
    return `工具结果从 ${original ?? 0} 字符压缩到 ${rendered ?? 0} 字符`
  }
  if (event.kind === 'tool_call' && event.status === 'completed') return '工具结果会进入运行步骤，并可能作为下一轮模型上下文'
  if (event.kind === 'tool_call' && event.status === 'failed') return '本次工具没有成功，错误会反馈给模型或用户'
  if (event.kind === 'run' && event.title === 'Worker started') return '这个执行器的后续模型调用、工具调用和产物都会归到本次任务'
  if (event.kind === 'run' && event.title === 'Planner started') return '这个规划器的后续调度会创建或更新计划任务、执行器运行和任务产物'
  if (event.kind === 'assistant' && event.title === 'Assistant message created') return '这条消息会进入线程历史，后续运行可能把它带入模型请求上下文'
  if (event.kind === 'approval' || event.kind === 'input') return '运行暂停，等待用户处理后继续'
  return undefined
}

function traceContextGroups(event: AgentTraceEvent, data: Record<string, unknown> | undefined, eventType?: string, phase?: string): AgentTraceContextGroup[] {
  const groups: AgentTraceContextGroup[] = []
  if (!data) return groups

  if (event.kind === 'prompt') {
    groups.push(group('上下文组成', [
      item('总字符', numberValue(data.charCount)),
      item('消息数', numberValue(data.messageCount)),
      item('系统消息', numberValue(data.systemMessageCount)),
      item('调试片段', arrayValue(data.debugPartIds)?.length),
      item('被阻塞工具', numberValue(data.blockedToolCount)),
    ]))
    groups.push(group('技能和工具', [
      item('激活技能', arrayValue(data.skillIds)?.join(', ')),
      item('可用工具', arrayValue(data.availableToolNames)?.join(', ')),
    ]))
    const promptStats = recordValue(data.promptStats)
    const byLayer = recordValue(promptStats?.byLayer)
    if (byLayer) {
      groups.push(group('上下文层级字符数', Object.entries(byLayer).map(([key, value]) => item(key, numberValue(value)))))
    }
  }

  if (eventType === 'context.run_built') {
    groups.push(group('本轮输入', [
      item('运行', stringValue(data.runId)),
      item('线程', stringValue(data.threadId)),
      item('目录快照', stringValue(data.catalogSnapshotId)),
      item('技能', arrayValue(data.activeSkillIds)?.join(', ')),
      item('可见工具', arrayValue(data.visibleToolNames)?.join(', ')),
      item('记忆引用', numberValue(data.memoryRefCount)),
    ]))
    const focus = recordValue(data.focus)
    const project = recordValue(focus?.project)
    const route = recordValue(focus?.route)
    groups.push(group('页面焦点', [
      item('路径', stringValue(route?.pathname)),
      item('项目', project ? `#${numberValue(project.id) ?? '-'} ${stringValue(project.name) ?? ''}`.trim() : undefined),
      item('制作', numberValue(focus?.productionId)),
    ]))
  }

  if (eventType === 'context.ledger_updated') {
    const refs = arrayValue(data.refs)?.slice(0, 8).map((ref) => {
      const record = recordValue(ref)
      return item(`${stringValue(record?.type) ?? 'ref'}:${stringValue(record?.id) ?? '-'}`, [stringValue(record?.title), stringValue(record?.source), stringValue(record?.evidence)].filter(Boolean).join(' / '))
    }) ?? []
    groups.push(group('新增/保留引用', refs))
  }

  if (event.kind === 'model_call') {
    const request = recordValue(data.request)
    const response = recordValue(data.response)
    const body = recordValue(request?.body)
    const messages = arrayValue(body?.messages)
    groups.push(group('HTTP 调用', [
      item('阶段', tracePhaseLabel(phase)),
      item('模型', stringValue(data.model) ?? stringValue(recordValue(data.config)?.model)),
      item('延迟', formatMs(numberValue(data.latencyMs))),
      item('状态码', numberValue(response?.status)),
      item('成功', booleanLabel(response?.ok)),
    ]))
    groups.push(group('HTTP 响应', [
      item('状态码', numberValue(response?.status)),
      item('内容类型', stringValue(recordValue(response?.headers)?.['content-type'])),
      item('响应字符', stringValue(response?.bodyText)?.length),
      item('响应预览', previewText(response?.content) ?? previewText(response?.bodyText)),
      item('解析 ID', stringValue(recordValue(response?.parsedBody)?.id)),
    ]))
    const roleCounts = countMessagesByRole(messages)
    groups.push(group('请求上下文', [
      item('总消息', messages?.length),
      item('系统消息', roleCounts.system),
      item('用户消息', roleCounts.user),
      item('助手消息', roleCounts.assistant),
      item('工具结果', roleCounts.tool),
    ]))
    const previewItems = messages?.slice(0, 4).map((message, index) => {
      const record = recordValue(message)
      const role = stringValue(record?.role) ?? 'unknown'
      const content = previewText(record?.content)
      return item(`${index + 1}. ${messageRoleLabel(role)}`, content)
    }) ?? []
    if (previewItems.length > 0) groups.push(group('消息预览', previewItems))
    groups.push(group('请求负载摘要', [
      item('消息条数', messages?.length),
      item('工具定义', arrayValue(body?.tools)?.length),
      item('工具选择', modelToolChoiceLabel(stringValue(body?.tool_choice))),
      item('流式返回', booleanLabel(body?.stream)),
    ]))
    groups.push(group('模型结果', [
      item('结束原因', modelFinishReasonLabel(stringValue(data.finish_reason))),
      item('回复字符', numberValue(data.content_chars)),
      item('请求 token', numberValue(recordValue(data.usage)?.input_tokens)),
      item('回复 token', numberValue(recordValue(data.usage)?.output_tokens)),
      item('工具调用', arrayValue(data.tool_calls)?.length),
    ]))
  }

  if (event.kind === 'assistant' && event.title === 'Assistant message created') {
    groups.push(group('历史写入', [
      item('消息 ID', stringValue(data.messageId)),
      item('回复字符', numberValue(data.chars)),
      item('来源', messageSourceLabel(stringValue(data.source) ?? 'model')),
      item('内容预览', previewText(data.content)),
    ]))
  }

  if (event.kind === 'tool_call') {
    groups.push(group('工具执行', [
      item('工具', event.toolName),
      item('来源', stringValue(data.source)),
      item('耗时', formatMs(numberValue(data.durationMs))),
      item('沙箱', booleanLabel(data.sandboxed)),
    ]))
  }

  return groups.filter((entry) => entry.items.length > 0)
}

function traceModelDetail(event: AgentTraceEvent, data: Record<string, unknown> | undefined): AgentTraceModelDetail | undefined {
  if (event.kind !== 'model_call' || !data) return undefined
  const request = recordValue(data.request)
  const response = recordValue(data.response)
  const body = recordValue(request?.body)
  const messages = arrayValue(body?.messages)?.map((message, index) => {
    const record = recordValue(message)
    const role = stringValue(record?.role) ?? 'unknown'
    const content = messageContentText(record?.content)
    return {
      index: index + 1,
      role,
      roleLabel: messageRoleLabel(role),
      content: content ?? '（空内容）',
      contentChars: content?.length ?? 0,
    }
  }) ?? []
  const tools = arrayValue(body?.tools)?.map((tool, index) => {
    const record = recordValue(tool)
    const fn = recordValue(record?.function)
    const parameters = recordValue(fn?.parameters)
    const properties = recordValue(parameters?.properties)
    return {
      index: index + 1,
      name: stringValue(fn?.name) ?? stringValue(record?.name) ?? `tool_${index + 1}`,
      description: stringValue(fn?.description),
      parameterKeys: properties ? Object.keys(properties) : [],
    }
  }) ?? []
  const parsedBody = recordValue(response?.parsedBody)
  const usage = recordValue(data.usage)
  const resultToolCalls = arrayValue(data.tool_calls)
  const requestDetail = request ? {
    method: stringValue(request.method),
    url: stringValue(request.url),
    model: stringValue(body?.model) ?? stringValue(data.model) ?? stringValue(recordValue(data.config)?.model),
    messageCount: messages.length > 0 ? String(messages.length) : undefined,
    toolCount: tools.length > 0 ? String(tools.length) : undefined,
    toolChoice: stringValue(body?.tool_choice),
    toolChoiceLabel: modelToolChoiceLabel(stringValue(body?.tool_choice)),
    stream: booleanLabel(body?.stream),
  } : undefined
  const responseDetail = response ? {
    status: numberValue(response.status) !== undefined ? String(numberValue(response.status)) : undefined,
    contentType: stringValue(recordValue(response.headers)?.['content-type']),
    content: stringValue(response.content),
    bodyText: stringValue(response.bodyText),
    parsedId: stringValue(parsedBody?.id),
  } : undefined
  const result = {
    finishReason: stringValue(data.finish_reason),
    finishReasonLabel: modelFinishReasonLabel(stringValue(data.finish_reason)),
    contentChars: numberValue(data.content_chars) !== undefined ? String(numberValue(data.content_chars)) : undefined,
    inputTokens: numberValue(usage?.input_tokens) !== undefined ? String(numberValue(usage?.input_tokens)) : undefined,
    outputTokens: numberValue(usage?.output_tokens) !== undefined ? String(numberValue(usage?.output_tokens)) : undefined,
    toolCalls: resultToolCalls !== undefined ? String(resultToolCalls.length) : undefined,
  }
  if (!requestDetail && messages.length === 0 && tools.length === 0 && !responseDetail && Object.values(result).every((value) => !value)) return undefined
  const kind = responseDetail ? 'http' : requestDetail ? 'request' : 'result'
  return {
    kind,
    title: kind === 'http' ? '大模型 HTTP 详情' : kind === 'request' ? '大模型 HTTP 请求' : '模型输出汇总',
    ...(kind === 'result' ? { note: '这条事件是模型输出摘要，不是底层 HTTP 传输记录；HTTP 请求/响应请查看同一轮相邻的模型调用事件。' } : {}),
    ...(requestDetail ? { request: requestDetail } : {}),
    messages,
    tools,
    ...(responseDetail ? { response: responseDetail } : {}),
    ...(Object.values(result).some((value) => !!value) ? { result } : {}),
  }
}

function traceMessageDetail(event: AgentTraceEvent, data: Record<string, unknown> | undefined): AgentTraceMessageDetail | undefined {
  if (event.kind !== 'assistant' || event.title !== 'Assistant message created' || !data) return undefined
  const content = stringValue(data.content)
  if (!content) return undefined
  return {
    title: '历史消息详情',
    messageId: stringValue(data.messageId),
    source: stringValue(data.source) ?? 'model',
    sourceLabel: messageSourceLabel(stringValue(data.source) ?? 'model'),
    content,
    contentChars: numberValue(data.chars) ?? content.length,
  }
}

function hasModelHTTPResponse(event: AgentTraceEvent): boolean {
  return !!recordValue(recordValue(event.data)?.response)
}

function group(label: string, items: Array<{ label: string; value?: string }>): AgentTraceContextGroup {
  return { label, items: items.flatMap((entry) => entry.value ? [{ label: entry.label, value: entry.value }] : []) }
}

function item(label: string, value: unknown): { label: string; value?: string } {
  if (value === undefined || value === null || value === '') return { label }
  return { label, value: String(value) }
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function arrayValue(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function booleanLabel(value: unknown): string | undefined {
  return typeof value === 'boolean' ? (value ? '是' : '否') : undefined
}

function formatReportTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const formatted = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
  return `${formatted} (${value})`
}

function formatReportDuration(start: string | undefined, end: string | undefined): string | undefined {
  if (!start || !end) return undefined
  const startMs = new Date(start).getTime()
  const endMs = new Date(end).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return undefined
  const ms = endMs - startMs
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
}

function businessPermissionLabel(permission: string): string | undefined {
  const parts = permission.split(/[.:/]/).filter(Boolean)
  const domain = parts.includes('project')
    ? '项目'
    : parts.includes('draft')
      ? '草稿'
      : parts.includes('memory')
        ? '记忆'
        : parts.includes('generation')
          ? '生成任务'
          : undefined
  const target = parts.includes('assets')
    ? '素材'
    : parts.includes('artifact') || parts.includes('artifacts')
      ? '产物'
      : parts.includes('thread') || parts.includes('threads')
        ? '线程'
        : ''
  const action = parts.includes('write')
    ? '写入'
    : parts.includes('read')
      ? '读取'
      : parts.includes('execute')
        ? '执行'
        : parts.includes('delete')
          ? '删除'
          : undefined
  if (!domain || !action) return undefined
  return `${domain}${target}${action}`
}

function unknownLabel(scope: string, value: string): string {
  return `未知${scope} (${value})`
}

function tracePhaseLabel(phase: string | undefined): string | undefined {
  switch (phase) {
    case 'request': return '请求'
    case 'response': return '响应'
    case 'retry': return '重试'
    case 'error': return '错误'
    default: return phase
  }
}

function localizedTraceTitle(title: string): string | undefined {
  switch (title) {
    case 'Worker started': return '执行器启动'
    case 'Planner started': return '规划器启动'
    case 'Asset review tool call': return '素材风险审计工具调用'
    case 'Subagent dispatch tool call': return '子代理调度工具调用'
    case 'Thread history compacted': return '压缩线程历史'
    case 'Knowledge searched': return '检索知识库'
    case 'Knowledge loaded': return '加载知识片段'
    case 'Tool result body summarized': return '压缩工具结果正文'
    default: return undefined
  }
}

function localizedTraceSummary(summary: string): string | undefined {
  const httpCall = summary.match(/^([A-Z]+)\s+(.+)$/)
  if (httpCall && httpCall[1] && httpCall[2]?.startsWith('/')) return `请求 ${httpCall[1]} ${httpCall[2]}`
  const httpResponse = summary.match(/^HTTP\s+(\d{3})(?:\s+in\s+(.+))?$/)
  if (httpResponse) return `HTTP ${httpResponse[1]}${httpResponse[2] ? `，耗时 ${httpResponse[2]}` : ''}`
  const promptComposed = summary.match(/^Prompt composed(?:\s+for\s+(.+))?\.?$/i)
  if (promptComposed) {
    const target = promptComposed[1]?.replace(/\.$/, '')
    return target ? `已组装模型上下文：${target}` : '已组装模型上下文。'
  }
  switch (summary) {
    case 'Planner started plan orchestration.': return '规划器开始编排计划。'
    case 'Found missing hero visual coverage.': return '发现缺少主视觉覆盖。'
    case 'Spawned worker Einstein.': return '已启动执行器 Einstein。'
    default: return undefined
  }
}

function messageRoleLabel(role: string): string {
  switch (role) {
    case 'system': return '系统'
    case 'user': return '用户'
    case 'assistant': return '助手'
    case 'tool': return '工具'
    default: return role
  }
}

function modelToolChoiceLabel(value: string | undefined): string | undefined {
  switch (value) {
    case 'auto': return '自动选择 (auto)'
    case 'none': return '不调用工具 (none)'
    case 'required': return '必须调用工具 (required)'
    default: return value
  }
}

function modelFinishReasonLabel(value: string | undefined): string | undefined {
  switch (value) {
    case 'stop': return '正常结束 (stop)'
    case 'length': return '达到长度限制 (length)'
    case 'tool_calls': return '触发工具调用 (tool_calls)'
    case 'content_filter': return '内容过滤 (content_filter)'
    default: return value
  }
}

function messageSourceLabel(value: string | undefined): string | undefined {
  switch (value) {
    case 'model': return '模型输出 (model)'
    case 'runtime': return '运行时 (runtime)'
    case 'tool': return '工具结果 (tool)'
    case 'user': return '用户 (user)'
    default: return value
  }
}

function formatMs(value: number | undefined): string | undefined {
  return value === undefined ? undefined : `${Math.round(value)}ms`
}

function previewText(value: unknown): string | undefined {
  const text = stringValue(value)
  if (!text) return undefined
  return text.length > 90 ? `${text.slice(0, 87)}...` : text
}

function messageContentText(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value === undefined || value === null) return undefined
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function countMessagesByRole(messages: unknown[] | undefined): Record<'system' | 'user' | 'assistant' | 'tool', number> {
  const counts = { system: 0, user: 0, assistant: 0, tool: 0 }
  for (const message of messages ?? []) {
    const role = stringValue(recordValue(message)?.role)
    if (role === 'system' || role === 'user' || role === 'assistant' || role === 'tool') {
      counts[role] += 1
    }
  }
  return counts
}
