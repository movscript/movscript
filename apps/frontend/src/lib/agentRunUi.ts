import type { AgentRun, AgentTraceEvent } from './localAgentClient'

export type AgentTraceCategory = 'context' | 'action' | 'impact' | 'http' | 'decision' | 'attention'

export interface AgentTraceView {
  category: AgentTraceCategory
  categoryLabel: string
  title: string
  summary?: string
  behavior?: string
  impact?: string
  contextGroups: AgentTraceContextGroup[]
  modelDetail?: AgentTraceModelDetail
  messageDetail?: AgentTraceMessageDetail
}

export interface AgentTraceContextGroup {
  label: string
  items: Array<{ label: string; value: string }>
}

export interface AgentTraceModelDetail {
  kind: 'http' | 'result'
  title: string
  note?: string
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
  content: string
  contentChars: number
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
    default: return status.replace(/_/g, ' ')
  }
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
    modelDetail: traceModelDetail(event, data),
    messageDetail: traceMessageDetail(event, data),
  }
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
  if (event.kind === 'run' && event.title === 'Worker started') return '启动 worker run，开始执行分配到的任务'
  if (event.kind === 'run' && event.title === 'Planner started') return '启动 planner run，开始编排任务和子代理'
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
  if (event.kind === 'tool_call' && event.status === 'completed') return '工具结果会进入 run step，并可能作为下一轮模型上下文'
  if (event.kind === 'tool_call' && event.status === 'failed') return '本次工具没有成功，错误会反馈给模型或用户'
  if (event.kind === 'run' && event.title === 'Worker started') return '这个 worker 的后续模型调用、工具调用和产物都会归到本次任务'
  if (event.kind === 'run' && event.title === 'Planner started') return '这个 planner 的后续调度会创建或更新计划任务、worker run 和任务产物'
  if (event.kind === 'assistant' && event.title === 'Assistant message created') return '这条消息会进入线程历史，后续 run 可能把它带入模型请求上下文'
  if (event.kind === 'approval' || event.kind === 'input') return 'run 暂停，等待用户处理后继续'
  return undefined
}

function traceContextGroups(event: AgentTraceEvent, data: Record<string, unknown> | undefined, eventType?: string, phase?: string): AgentTraceContextGroup[] {
  const groups: AgentTraceContextGroup[] = []
  if (!data) return groups

  if (event.kind === 'prompt') {
    groups.push(group('Prompt 组成', [
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
      item('run', stringValue(data.runId)),
      item('thread', stringValue(data.threadId)),
      item('catalog', stringValue(data.catalogSnapshotId)),
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
      item('production', numberValue(focus?.productionId)),
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
      item('工具选择', stringValue(body?.tool_choice)),
      item('流式返回', booleanLabel(body?.stream)),
    ]))
    groups.push(group('模型结果', [
      item('结束原因', stringValue(data.finish_reason)),
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
      item('来源', stringValue(data.source) ?? 'model'),
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
  const responseDetail = response ? {
    status: numberValue(response.status) !== undefined ? String(numberValue(response.status)) : undefined,
    contentType: stringValue(recordValue(response.headers)?.['content-type']),
    content: stringValue(response.content),
    bodyText: stringValue(response.bodyText),
    parsedId: stringValue(parsedBody?.id),
  } : undefined
  const result = {
    finishReason: stringValue(data.finish_reason),
    contentChars: numberValue(data.content_chars) !== undefined ? String(numberValue(data.content_chars)) : undefined,
    inputTokens: numberValue(usage?.input_tokens) !== undefined ? String(numberValue(usage?.input_tokens)) : undefined,
    outputTokens: numberValue(usage?.output_tokens) !== undefined ? String(numberValue(usage?.output_tokens)) : undefined,
    toolCalls: resultToolCalls !== undefined ? String(resultToolCalls.length) : undefined,
  }
  if (messages.length === 0 && tools.length === 0 && !responseDetail && Object.values(result).every((value) => !value)) return undefined
  const kind = responseDetail ? 'http' : 'result'
  return {
    kind,
    title: kind === 'http' ? '大模型 HTTP 详情' : '模型输出汇总',
    ...(kind === 'result' ? { note: '这条事件是模型输出摘要，不是底层 HTTP 传输记录；HTTP 请求/响应请查看同一轮相邻的模型调用事件。' } : {}),
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
