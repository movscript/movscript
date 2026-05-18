import type { AgentApprovalRequest, AgentRun, AgentTraceEvent } from './localAgentClient'
import { isRecord } from './jsonValue'

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
  toolDetail?: AgentTraceToolDetail
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
    headers: Array<{ name: string; value: string }>
    payload?: unknown
  }
  messageGroups: AgentTraceModelMessageGroup[]
  messages: AgentTraceModelMessageDetail[]
  tools: AgentTraceModelToolDetail[]
  response?: {
    status?: string
    contentType?: string
    headers: Array<{ name: string; value: string }>
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

export interface AgentTraceModelMessageGroup {
  role: string
  roleLabel: string
  count: number
  contentChars: number
  messages: AgentTraceModelMessageDetail[]
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

export interface AgentTraceToolDetail {
  title: string
  toolName?: string
  status: string
  statusLabel: string
  source?: string
  sandboxed?: string
  duration?: string
  summary?: string
  fields: AgentTraceToolField[]
}

export interface AgentTraceToolField {
  label: string
  value: string
  sensitive?: boolean
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
  partGroups: AgentTracePromptPartGroup[]
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

export interface AgentTracePromptPartGroup {
  contextLayer: string
  count: number
  chars: string
  parts: AgentTracePromptPart[]
}

export interface AgentModelCallSummary {
  id: string
  label: string
  roundId?: string
  roundIndex?: number
  roundLabel?: string
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

export interface AgentModelCallDebugContext {
  call: AgentModelCallSummary
  modelEvents: AgentTraceEvent[]
  messageWrites: AgentTraceEvent[]
  toolCalls: AgentTraceEvent[]
  correlationLabel: string
  issue?: string
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
  id: string
  label: string
  description: string
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

export interface AgentDebugReportInput {
  runId: string
  run?: Pick<AgentRun, 'status' | 'role' | 'createdAt' | 'startedAt' | 'completedAt' | 'failedAt' | 'cancelledAt' | 'error' | 'warnings' | 'pendingApprovals' | 'pendingInputRequests'>
  coverage: AgentDebugCoverageSummary
  modelCalls: AgentModelCallSummary[]
  events: AgentTraceEvent[]
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
    description: '优先加载全部事件；如果仍缺失，通常是旧运行、异常中断或当时未采集。',
  },
]

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

export function buildSkillTraceSummary(events: AgentTraceEvent[]): AgentSkillTraceSummary {
  const timeline = events.flatMap((event): AgentSkillTraceEntry[] => {
    const data = recordValue(event.data)
    const eventType = stringValue(data?.skillEventType) ?? stringValue(data?.eventType)
    if (event.kind !== 'skill' && !eventType?.startsWith('skill.')) return []
    const activeSkillIds = stringList(data?.activeSkillIds)
    const loadedSkillIds = stringList(data?.loadedSkillIds)
    const unloadedSkillIds = stringList(data?.unloadedSkillIds)
    const availableSkillIds = stringList(data?.availableSkillIds)
    return [{
      eventId: event.id,
      createdAt: event.createdAt,
      eventType: eventType ?? 'skill.event',
      title: skillTraceTitle(eventType, event.title),
      summary: traceSummary(event),
      activeSkillIds,
      loadedSkillIds,
      unloadedSkillIds,
      availableSkillIds,
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
    toolDetail: traceToolDetail(event, data),
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
  const toolCalls = input.events.filter((event) => event.kind === 'tool_call').length
  const toolDetails = input.events.filter((event) => !!agentTraceView(event).toolDetail).length
  const httpResponses = input.modelCalls.filter((call) => call.responseEventId).length
  const requestPayloads = input.modelCalls.filter((call) => call.hasRequestPayload).length
  const httpResponseBodies = input.events.filter((event) => !!agentTraceView(event).modelDetail?.response?.bodyText).length
  const modelCallsWithoutRequestPayload = input.modelCalls.filter((call) => !call.hasRequestPayload && call.status !== 'result_only').length
  const httpResponsesWithoutBody = Math.max(0, httpResponses - httpResponseBodies)
  const incompleteModelCalls = input.modelCalls.filter((call) => call.status !== 'complete')
  const modelCallsWithReply = input.modelCalls.filter((call) => Number(call.responseChars ?? 0) > 0)
  const hasUnloadedTrace = hasUnloadedTraceEvents({ loaded: input.events.length, total: input.total, hasMore: input.hasMore })
  const issues = [
    hasUnloadedTrace ? '还有未加载运行事件，当前统计只覆盖已加载事件。' : undefined,
    incompleteModelCalls.length > 0 ? `${incompleteModelCalls.length} 次模型调用缺少请求或响应事件；请先加载全部事件，如果仍缺失，多半是旧运行或异常中断时没有采集到完整 HTTP 详情。` : undefined,
    modelCallsWithoutRequestPayload > 0 ? `${modelCallsWithoutRequestPayload} 次模型调用没有请求负载；无法展开当时发送给模型的完整 messages/tools/body。` : undefined,
    httpResponsesWithoutBody > 0 ? `${httpResponsesWithoutBody} 次模型 HTTP 响应没有原始响应正文；可以看到状态和解析结果，但无法展开完整回复 body。` : undefined,
    input.events.length > 0 && promptDetails === 0 ? '当前已加载事件里没有模型上下文详情；可能是旧运行未记录上下文组成，或这批分页还没有加载到上下文组装事件（Prompt composed）。' : undefined,
    modelCallsWithReply.length > 0 && messageWrites === 0 ? `${modelCallsWithReply.length} 次模型调用有回复内容，但当前已加载事件里没有 assistant 历史写入；请检查最终回复是否保存到线程历史，或加载全部事件。` : undefined,
    toolCalls > 0 && toolDetails < toolCalls ? `${toolCalls - toolDetails} 次工具调用没有结构化详情；只能查看原始事件数据。` : undefined,
  ].filter((issue): issue is string => !!issue)
  return {
    loadedLabel: typeof input.total === 'number' ? `${input.events.length} / ${input.total}` : `${input.events.length}`,
    hasUnloadedTrace,
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

export function hasUnloadedTraceEvents(input: { loaded: number; total?: number; hasMore: boolean }): boolean {
  return input.hasMore || (typeof input.total === 'number' && input.loaded < input.total)
}

export function buildDebugReadinessChecklist(summary: AgentDebugCoverageSummary): AgentDebugReadinessItem[] {
  const modelCalls = firstNumber(summary.modelCallsLabel)
  const promptDetails = firstNumber(summary.promptDetailsLabel)
  const messageWrites = firstNumber(summary.messageWritesLabel)
  const requestPayloads = firstNumber(summary.requestPayloadsLabel)
  const httpResponses = firstNumber(summary.httpResponsesLabel)
  const httpResponseBodies = firstNumber(summary.httpResponseBodiesLabel)
  const [toolDetails, toolCalls] = slashNumbers(summary.toolDetailsLabel)
  const items: AgentDebugReadinessItem[] = [
    {
      id: 'trace_loaded',
      label: '事件完整性',
      status: summary.hasUnloadedTrace ? 'warning' : 'ok',
      detail: summary.hasUnloadedTrace ? `当前只加载 ${summary.loadedLabel}，请先加载全部事件。` : `已加载 ${summary.loadedLabel}。`,
      action: summary.hasUnloadedTrace ? '点击“加载全部事件”，再重新复制摘要或调试包。' : '可以基于当前事件继续判断。',
    },
    {
      id: 'context_detail',
      label: '上下文可解释',
      status: promptDetails > 0 ? 'ok' : 'warning',
      detail: promptDetails > 0 ? `已记录 ${promptDetails} 条模型上下文详情。` : '没有模型上下文详情，难以判断 agent 当时看到了什么。',
      action: promptDetails > 0 ? '展开“上下文详情”查看来源层级和片段。' : '先加载全部事件；如果仍缺失，按旧运行或采集缺口处理。',
    },
    {
      id: 'model_http',
      label: '模型 HTTP 链路',
      status: modelCalls === 0 || httpResponses >= modelCalls ? 'ok' : 'warning',
      detail: modelCalls === 0 ? '当前没有模型调用。' : `模型调用 ${modelCalls} 次，HTTP 响应 ${httpResponses} 次。`,
      action: modelCalls === 0 ? '无需检查模型 HTTP。' : httpResponses >= modelCalls ? '展开“大模型调用总览”核对请求、响应和结果。' : '先加载全部事件；如果仍缺响应，检查失败、取消或重试事件。',
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
  return items
}

export function buildDebugReportText(input: AgentDebugReportInput): string {
  const runEndedAt = input.run?.completedAt ?? input.run?.failedAt ?? input.run?.cancelledAt
  const runDuration = formatReportDuration(input.run?.startedAt ?? input.run?.createdAt, runEndedAt)
  const lines = [
    'AgentRun 调试摘要',
    `运行: ${input.runId}`,
    ...(input.run ? [
      `状态: ${runStatusLabel(input.run.status)}`,
      `角色: ${runRoleLabel(input.run.role)}`,
      `创建: ${formatReportTimestamp(input.run.createdAt)}`,
      input.run.startedAt ? `开始: ${formatReportTimestamp(input.run.startedAt)}` : undefined,
      runEndedAt ? `结束: ${formatReportTimestamp(runEndedAt)}` : undefined,
      runDuration ? `耗时: ${runDuration}` : undefined,
      input.run.error ? `错误: ${input.run.error}` : undefined,
      input.run.warnings && input.run.warnings.length > 0 ? `警告: ${input.run.warnings.join('；')}` : undefined,
    ].filter((line): line is string => !!line) : []),
    `事件: ${input.coverage.loadedLabel}`,
    `模型调用: ${input.coverage.modelCallsLabel}`,
    `HTTP 响应: ${input.coverage.httpResponsesLabel}`,
    `请求负载: ${input.coverage.requestPayloadsLabel}`,
    `响应正文: ${input.coverage.httpResponseBodiesLabel}`,
    `上下文详情: ${input.coverage.promptDetailsLabel}`,
    `历史写入: ${input.coverage.messageWritesLabel}`,
    `工具详情: ${input.coverage.toolDetailsLabel}`,
  ]
  const readinessChecklist = buildDebugReadinessChecklist(input.coverage)
  if (readinessChecklist.length > 0) {
    lines.push('', '诊断清单:')
    for (const item of readinessChecklist) {
      lines.push(`- ${item.status === 'ok' ? '已满足' : '需补全'} ${item.label}: ${item.detail}`)
      lines.push(`  - 下一步: ${item.action}`)
    }
  }
  lines.push('', '调试口径:')
  for (const item of AGENT_DEBUG_FIELD_GUIDE) {
    lines.push(`- ${item.label}: ${item.description}`)
  }
  if (input.coverage.issues.length > 0) {
    lines.push('', '需关注:')
    for (const issue of input.coverage.issues) lines.push(`- ${issue}`)
  }
  const pendingActions = debugReportPendingActions(input.run)
  if (pendingActions.length > 0) {
    lines.push('', '待处理:')
    for (const action of pendingActions) lines.push(`- ${action}`)
  }
  if (input.modelCalls.length > 0) {
    lines.push('', '模型调用:')
    for (const call of input.modelCalls) {
      const capture = [
        call.hasRequestPayload ? '请求负载已存' : '请求负载缺失',
        call.responseEventId ? (call.hasResponseBody ? '响应正文已存' : '响应正文缺失') : undefined,
      ].filter(Boolean).join('，')
      lines.push(`- ${call.label}: ${call.statusLabel}${call.model ? `，模型 ${call.model}` : ''}${call.httpStatus ? `，HTTP ${call.httpStatus}` : ''}${call.latency ? `，${call.latency}` : ''}${capture ? `，${capture}` : ''}${call.retryCount ? `，重试 ${call.retryCount} 次` : ''}${call.error ? `，错误 ${call.error}` : ''}`)
      const requestContext = debugReportModelRequestContext(call, input.events)
      if (requestContext) lines.push(`  - 请求上下文: ${requestContext}`)
      if (call.issue) lines.push(`  - ${call.issue}`)
    }
  }
  const modelCallContexts = buildModelCallDebugContexts({ modelCalls: input.modelCalls, events: input.events })
  if (modelCallContexts.length > 0) {
    lines.push('', '轮次关联:')
    for (const context of modelCallContexts) {
      const call = context.call
      lines.push(`- ${call.label}: 关联方式 ${context.correlationLabel}，模型事件 ${context.modelEvents.length}，工具调用 ${context.toolCalls.length}，历史写入 ${context.messageWrites.length}`)
      const eventLinks = [
        call.requestEventId ? `请求 ${call.requestEventId}` : undefined,
        call.responseEventId ? `响应 ${call.responseEventId}` : undefined,
        call.resultEventId ? `结果 ${call.resultEventId}` : undefined,
      ].filter(Boolean).join('，')
      if (eventLinks) lines.push(`  - 事件: ${eventLinks}`)
      const toolPreview = context.toolCalls.slice(0, 4).map((event) => {
        const detail = agentTraceView(event).toolDetail
        return detail?.toolName ?? event.toolName ?? event.title
      }).join('，')
      if (toolPreview) lines.push(`  - 工具: ${toolPreview}${context.toolCalls.length > 4 ? `, +${context.toolCalls.length - 4}` : ''}`)
      const historyPreview = context.messageWrites.slice(0, 3).map((event) => {
        const detail = agentTraceView(event).messageDetail
        return detail?.messageId ?? event.id
      }).join('，')
      if (historyPreview) lines.push(`  - 历史: ${historyPreview}${context.messageWrites.length > 3 ? `, +${context.messageWrites.length - 3}` : ''}`)
      if (context.issue) lines.push(`  - ${context.issue}`)
    }
  }
  const attentionEvents = buildDebugAttentionEvents(input.events)
  if (attentionEvents.length > 0) {
    lines.push('', '异常/需关注事件:')
    for (const event of attentionEvents.slice(0, 8)) {
      lines.push(`- ${formatReportTimestamp(event.createdAt)} ${event.kindLabel} ${event.statusLabel}: ${event.title}${event.summary ? ` - ${event.summary}` : ''}`)
      if (event.behavior) lines.push(`  - 行为: ${event.behavior}`)
      if (event.impact) lines.push(`  - 影响: ${event.impact}`)
      if (event.error) lines.push(`  - 错误: ${event.error}`)
    }
  }
  const promptDetails = input.events
    .map((event) => ({ event, view: agentTraceView(event) }))
    .filter((entry) => !!entry.view.promptDetail)
    .slice(-3)
  if (promptDetails.length > 0) {
    lines.push('', '上下文详情:')
    for (const { event, view } of promptDetails) {
      const detail = view.promptDetail!
      const groups = detail.partGroups.slice(0, 4).map((group) => `${group.contextLayer} ${group.count}段/${group.chars}字`).join('，')
      const partIds = detail.parts.slice(0, 6).map((part) => part.id).join(', ')
      lines.push(`- ${formatReportTimestamp(event.createdAt)}: ${detail.totalChars ?? '-'} 字符${detail.messageCount ? `，${detail.messageCount} 条消息` : ''}${groups ? `，来源 ${groups}` : ''}`)
      if (partIds) lines.push(`  - 片段: ${partIds}${detail.parts.length > 6 ? `, +${detail.parts.length - 6}` : ''}`)
    }
  }
  const toolDetails = input.events
    .map((event) => ({ event, view: agentTraceView(event) }))
    .filter((entry) => !!entry.view.toolDetail)
    .slice(-5)
  if (toolDetails.length > 0) {
    lines.push('', '工具调用:')
    for (const { event, view } of toolDetails) {
      const detail = view.toolDetail!
      const fieldPreview = detail.fields.slice(0, 4).map((field) => `${field.label}=${field.sensitive ? '[已脱敏]' : field.value}`).join('，')
      lines.push(`- ${formatReportTimestamp(event.createdAt)}: ${detail.statusLabel}${detail.toolName ? ` ${detail.toolName}` : ''}${detail.duration ? `，耗时 ${detail.duration}` : ''}${detail.summary ? `，${detail.summary}` : ''}`)
      if (fieldPreview) lines.push(`  - 字段: ${fieldPreview}${detail.fields.length > 4 ? `, +${detail.fields.length - 4}` : ''}`)
    }
  }
  const messageWrites = input.events
    .map((event) => ({ event, view: agentTraceView(event) }))
    .filter((entry) => !!entry.view.messageDetail)
    .slice(-5)
  if (messageWrites.length > 0) {
    lines.push('', '历史写入:')
    for (const { event, view } of messageWrites) {
      const detail = view.messageDetail!
      const preview = reportPreviewText(detail.content)
      lines.push(`- ${formatReportTimestamp(event.createdAt)}: ${detail.messageId ?? '-'}${detail.sourceLabel ? `，来源 ${detail.sourceLabel}` : ''}，${detail.contentChars} 字符`)
      if (preview) lines.push(`  - 内容: ${preview}`)
    }
  }
  const latestEvents = input.events.slice(-5)
  if (latestEvents.length > 0) {
    lines.push('', '最近事件:')
    for (const event of latestEvents) {
      const view = agentTraceView(event)
      const duration = formatTraceEventDuration(event, recordValue(event.data))
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

export function buildModelCallDebugContext(input: {
  call: AgentModelCallSummary
  events: AgentTraceEvent[]
}): AgentModelCallDebugContext {
  const modelEvents = input.call.eventIds
    .flatMap((eventId) => input.events.find((event) => event.id === eventId) ?? [])
  const relatedEvents = input.events.filter((event) => {
    if (event.kind !== 'assistant' && event.kind !== 'tool_call') return false
    if (input.call.roundId && event.roundId === input.call.roundId) return true
    if (input.call.roundIndex !== undefined && event.roundIndex === input.call.roundIndex) return true
    return eventFallsInsideModelCallWindow(event, input.call, input.events)
  })
  const messageWrites = relatedEvents.filter((event) => event.kind === 'assistant')
  const toolCalls = relatedEvents.filter((event) => event.kind === 'tool_call')
  const correlationLabel = input.call.roundLabel
    ?? (input.call.roundIndex !== undefined ? `第 ${input.call.roundIndex} 轮` : input.call.roundId ? `轮次 ${input.call.roundId}` : '相邻事件窗口')
  const issue = input.call.responseChars && messageWrites.length === 0
    ? '这次模型调用有回复内容，但没有找到同轮 assistant 历史写入。请加载全部事件，或检查回复是否只返回给调用方而未写入线程历史。'
    : undefined
  return {
    call: input.call,
    modelEvents,
    messageWrites,
    toolCalls,
    correlationLabel,
    issue,
  }
}

export function buildModelCallDebugContexts(input: {
  modelCalls: AgentModelCallSummary[]
  events: AgentTraceEvent[]
}): AgentModelCallDebugContext[] {
  return input.modelCalls.map((call) => buildModelCallDebugContext({ call, events: input.events }))
}

export function buildDebugAttentionEvents(events: AgentTraceEvent[]): AgentDebugAttentionEvent[] {
  return events
    .filter((event) => event.status === 'failed' || event.status === 'blocked' || event.kind === 'error' || agentTraceView(event).category === 'attention')
    .map((event) => {
      const view = agentTraceView(event)
      const data = recordValue(event.data)
      return {
        eventId: event.id,
        createdAt: event.createdAt,
        kind: event.kind,
        kindLabel: traceKindLabel(event.kind),
        status: event.status,
        statusLabel: traceEventStatusLabel(event.status),
        title: view.title,
        ...(view.summary ? { summary: redactReportInlineSecrets(view.summary) } : {}),
        ...(view.behavior ? { behavior: redactReportInlineSecrets(view.behavior) } : {}),
        ...(view.impact ? { impact: redactReportInlineSecrets(view.impact) } : {}),
        ...(stringValue(data?.error) ? { error: redactReportInlineSecrets(stringValue(data?.error)!) } : {}),
      }
    })
}

function debugReportPendingActions(run: AgentDebugReportInput['run']): string[] {
  if (!run || run.status !== 'requires_action') return []
  const approvals = (run.pendingApprovals ?? [])
    .filter((approval) => approval.status === 'pending')
    .map((approval) => {
      const parts = [
        `待审批 ${approval.toolName}`,
        approval.risk ? `风险 ${approvalRiskLabel(approval.risk)}` : undefined,
        approval.permission ? `权限 ${approvalPermissionLabel(approval.permission)}` : undefined,
        approval.reason ? `原因 ${approval.reason}` : undefined,
      ].filter(Boolean)
      return parts.join('，')
    })
  const inputs = (run.pendingInputRequests ?? [])
    .filter((request) => request.status === 'pending')
    .map((request) => {
      const choices = request.choices.length > 0 ? `选项 ${request.choices.map((choice) => choice.label).slice(0, 4).join(', ')}${request.choices.length > 4 ? `, +${request.choices.length - 4}` : ''}` : undefined
      const parts = [
        `待输入 ${request.title}`,
        `类型 ${inputTypeLabel(request.inputType)}`,
        request.question ? `问题 ${request.question}` : undefined,
        choices,
        request.allowCustomAnswer ? '允许自定义答案' : undefined,
      ].filter(Boolean)
      return parts.join('，')
    })
  return [...approvals, ...inputs]
}

function debugReportModelRequestContext(call: AgentModelCallSummary, events: AgentTraceEvent[]): string | undefined {
  const event = events.find((entry) => entry.id === call.requestEventId)
    ?? events.find((entry) => entry.id === call.responseEventId)
    ?? events.find((entry) => entry.id === call.resultEventId)
  const detail = event ? agentTraceView(event).modelDetail : undefined
  if (!detail) return undefined
  const messageGroups = detail.messageGroups
    .map((group) => `${group.roleLabel} ${group.count}条/${group.contentChars}字`)
    .join('，')
  const tools = detail.tools.slice(0, 5).map((tool) => tool.name).join(', ')
  const parts = [
    detail.request?.messageCount ? `消息 ${detail.request.messageCount}条` : undefined,
    messageGroups ? `角色 ${messageGroups}` : undefined,
    detail.request?.toolCount ? `工具定义 ${detail.request.toolCount}个${tools ? ` (${tools}${detail.tools.length > 5 ? `, +${detail.tools.length - 5}` : ''})` : ''}` : undefined,
    detail.request?.toolChoiceLabel ? `工具选择 ${detail.request.toolChoiceLabel}` : undefined,
    detail.request?.stream ? `流式返回 ${detail.request.stream}` : undefined,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join('，') : undefined
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
    ...(source?.roundId ? { roundId: source.roundId } : {}),
    ...(source?.roundIndex !== undefined ? { roundIndex: source.roundIndex } : {}),
    ...(source?.roundLabel ? { roundLabel: source.roundLabel } : {}),
    eventIds: group.events.map((event) => event.id),
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
    hasRequestPayload: !!requestBody,
    hasResponseBody: !!stringValue(response?.bodyText),
  }
}

function eventFallsInsideModelCallWindow(event: AgentTraceEvent, call: AgentModelCallSummary, events: AgentTraceEvent[]): boolean {
  if (call.roundId || call.roundIndex !== undefined) return false
  const modelEvents = call.eventIds
    .flatMap((eventId) => events.find((entry) => entry.id === eventId) ?? [])
    .map((entry) => ({ event: entry, time: Date.parse(entry.createdAt) }))
    .filter((entry) => Number.isFinite(entry.time))
    .sort((left, right) => left.time - right.time)
  const startTime = modelEvents[0]?.time
  const lastModelTime = modelEvents.at(-1)?.time
  const eventTime = Date.parse(event.createdAt)
  if (
    startTime === undefined ||
    lastModelTime === undefined ||
    !Number.isFinite(startTime) ||
    !Number.isFinite(lastModelTime) ||
    !Number.isFinite(eventTime) ||
    eventTime < startTime
  ) return false
  const callEventIds = new Set(call.eventIds)
  const nextModelStart = events
    .filter((entry) => entry.kind === 'model_call' && !callEventIds.has(entry.id) && Date.parse(entry.createdAt) > lastModelTime)
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))[0]
  const endTime = nextModelStart ? Date.parse(nextModelStart.createdAt) : startTime + 10 * 60 * 1000
  return eventTime < endTime
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
    partGroups: promptPartGroups(parts),
    parts,
  }
}

function promptPartGroups(parts: AgentTracePromptPart[]): AgentTracePromptPartGroup[] {
  const groups = new Map<string, { contextLayer: string; count: number; chars: number; parts: AgentTracePromptPart[] }>()
  for (const part of parts) {
    const key = part.contextLayer ?? '未分类'
    const group = groups.get(key) ?? { contextLayer: key, count: 0, chars: 0, parts: [] }
    group.count += 1
    group.chars += Number(part.chars ?? 0) || 0
    group.parts.push(part)
    groups.set(key, group)
  }
  return Array.from(groups.values())
    .sort((left, right) => right.chars - left.chars || left.contextLayer.localeCompare(right.contextLayer))
    .map((group) => ({
      contextLayer: group.contextLayer,
      count: group.count,
      chars: String(group.chars),
      parts: group.parts,
    }))
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
      item('耗时', formatTraceEventDuration(event, data)),
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
  const messageGroups = modelMessageGroups(messages)
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
  const headers = headerEntries(recordValue(request?.headers))
  const requestDetail = request ? {
    method: stringValue(request.method),
    url: stringValue(request.url),
    model: stringValue(body?.model) ?? stringValue(data.model) ?? stringValue(recordValue(data.config)?.model),
    messageCount: messages.length > 0 ? String(messages.length) : undefined,
    toolCount: tools.length > 0 ? String(tools.length) : undefined,
    toolChoice: stringValue(body?.tool_choice),
    toolChoiceLabel: modelToolChoiceLabel(stringValue(body?.tool_choice)),
    stream: booleanLabel(body?.stream),
    headers,
    ...(body ? { payload: body } : {}),
  } : undefined
  const responseDetail = response ? {
    status: numberValue(response.status) !== undefined ? String(numberValue(response.status)) : undefined,
    contentType: stringValue(recordValue(response.headers)?.['content-type']),
    headers: headerEntries(recordValue(response.headers)),
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
    messageGroups,
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

function traceToolDetail(event: AgentTraceEvent, data: Record<string, unknown> | undefined): AgentTraceToolDetail | undefined {
  if (event.kind !== 'tool_call') return undefined
  const duration = formatTraceEventDuration(event, data)
  const fields = data
    ? Object.entries(data)
      .filter(([key]) => !['source', 'durationMs', 'sandboxed'].includes(key))
      .flatMap(([key, value]) => {
        const displayValue = toolFieldValue(value)
        return displayValue ? [{ label: toolFieldLabel(key), value: displayValue, sensitive: isSensitiveFieldName(key) }] : []
      })
      .slice(0, 12)
    : []
  return {
    title: event.status === 'failed' ? '工具调用失败详情' : '工具调用详情',
    toolName: event.toolName,
    status: event.status,
    statusLabel: traceEventStatusLabel(event.status),
    source: stringValue(data?.source),
    sandboxed: booleanLabel(data?.sandboxed),
    duration,
    summary: traceSummary(event),
    fields,
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
  return isRecord(value) ? value : undefined
}

function arrayValue(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined
}

function headerEntries(headers: Record<string, unknown> | undefined): Array<{ name: string; value: string }> {
  if (!headers) return []
  return Object.entries(headers)
    .flatMap(([name, value]) => {
      const normalized = stringValue(name)
      const label = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : undefined
      return normalized && label ? [{ name: normalized, value: label }] : []
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function stringList(value: unknown): string[] {
  return arrayValue(value)?.flatMap((item) => {
    const text = stringValue(item)
    return text ? [text] : []
  }) ?? []
}

function skillTraceTitle(eventType: string | undefined, fallback: string): string {
  switch (eventType) {
    case 'skill.state_resolved': return '技能上下文已解析'
    case 'skill.state_requested': return '技能状态变更请求'
    case 'trigger.evaluated': return '技能触发已评估'
    default: return fallback || '技能事件'
  }
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function booleanLabel(value: unknown): string | undefined {
  return typeof value === 'boolean' ? (value ? '是' : '否') : undefined
}

function toolFieldValue(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'string') return previewText(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    const values = value.map((entry) => stringValue(entry) ?? (typeof entry === 'number' || typeof entry === 'boolean' ? String(entry) : undefined)).filter(Boolean)
    return values.length > 0 ? values.slice(0, 6).join(', ') : `${value.length} 项`
  }
  if (isRecord(value)) {
    const keys = Object.keys(value)
    return keys.length > 0 ? keys.slice(0, 8).join(', ') : undefined
  }
  return undefined
}

function toolFieldLabel(key: string): string {
  switch (key) {
    case 'artifactId': return '产物 ID'
    case 'findings': return '发现'
    case 'subagentName': return '子代理'
    case 'taskId': return '任务 ID'
    case 'error': return '错误'
    case 'result': return '结果'
    default: return key.replace(/[_-]/g, ' ')
  }
}

function isSensitiveFieldName(key: string): boolean {
  return /authorization|cookie|api[-_]?key|token|secret|signed/i.test(key)
}

function formatReportTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const formatted = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
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

export function traceEventDurationMs(event: AgentTraceEvent, data: Record<string, unknown> | undefined = recordValue(event.data)): number | undefined {
  const durationMs = nonNegativeNumberValue(data?.durationMs) ?? nonNegativeNumberValue(event.durationMs)
  if (durationMs !== undefined) return durationMs
  if (!event.createdAt || !event.completedAt) return undefined
  const startMs = new Date(event.createdAt).getTime()
  const endMs = new Date(event.completedAt).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return undefined
  return endMs - startMs
}

export function formatTraceEventDuration(event: AgentTraceEvent, data: Record<string, unknown> | undefined = recordValue(event.data)): string | undefined {
  const durationMs = traceEventDurationMs(event, data)
  return durationMs !== undefined ? formatDurationMs(durationMs) : undefined
}

function nonNegativeNumberValue(value: unknown): number | undefined {
  const number = numberValue(value)
  return number !== undefined && number >= 0 ? Math.round(number) : undefined
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

function formatDurationMs(value: number): string {
  const ms = Math.round(value)
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
}

function firstNumber(value: string): number {
  const match = value.match(/\d+/)
  return match ? Number(match[0]) : 0
}

function slashNumbers(value: string): [number, number] {
  const match = value.match(/(\d+)\s*\/\s*(\d+)/)
  if (!match) return [firstNumber(value), firstNumber(value)]
  return [Number(match[1]), Number(match[2])]
}

function previewText(value: unknown): string | undefined {
  const text = stringValue(value)
  if (!text) return undefined
  return text.length > 90 ? `${text.slice(0, 87)}...` : text
}

function reportPreviewText(value: string): string | undefined {
  const text = value.trim()
  if (!text) return undefined
  const redacted = redactReportInlineSecrets(text)
  return redacted.length > 160 ? `${redacted.slice(0, 157)}...` : redacted
}

function redactReportInlineSecrets(value: string): string {
  return value
    .replace(/\b(authorization\s*[:=]\s*)(bearer\s+)?[^\s"',;&]+/gi, (_match, prefix: string, bearer = '') => `${prefix}${bearer}[已脱敏]`)
    .replace(/\b((?:api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|secret|password)\s*[:=]\s*)[^\s"',;&]+/gi, (_match, prefix: string) => `${prefix}[已脱敏]`)
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

function modelMessageGroups(messages: AgentTraceModelMessageDetail[]): AgentTraceModelMessageGroup[] {
  const order = ['system', 'user', 'assistant', 'tool']
  const groups = new Map<string, AgentTraceModelMessageGroup>()
  for (const message of messages) {
    const key = message.role || 'unknown'
    const group = groups.get(key) ?? {
      role: key,
      roleLabel: message.roleLabel,
      count: 0,
      contentChars: 0,
      messages: [],
    }
    group.count += 1
    group.contentChars += message.contentChars
    group.messages.push(message)
    groups.set(key, group)
  }
  return Array.from(groups.values()).sort((a, b) => {
    const left = order.indexOf(a.role)
    const right = order.indexOf(b.role)
    if (left === -1 && right === -1) return a.role.localeCompare(b.role)
    if (left === -1) return 1
    if (right === -1) return -1
    return left - right
  })
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
