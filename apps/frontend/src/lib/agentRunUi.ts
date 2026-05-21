import type { AgentApprovalRequest, AgentRun, AgentTraceEvent } from './localAgentClient'
import { isRecord } from './jsonValue'
import { agentPermissionLabel, agentRiskLabel, agentToolNameLabel, agentToolNameWithId } from './agentToolDisplay'

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
  return agentRiskLabel(risk)
}

export function approvalPermissionLabel(permission: string): string {
  return agentPermissionLabel(permission)
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
    case 'movscript_spawn_subagent': return '批准后会启动子代理执行分配任务。'
    case 'movscript_cancel_subagent': return '批准后会取消子代理及其后续执行。'
    default: break
  }

  const permission = approval.permission ?? ''
  if (permission === 'draft.apply') return '批准后会把草稿变更应用到当前项目。'
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

export function hasUnloadedTraceEvents(input: { loaded: number; total?: number; hasMore: boolean }): boolean {
  return input.hasMore || (typeof input.total === 'number' && input.loaded < input.total)
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
  if (event.kind === 'tool_call' && event.title.startsWith('Tool completed:')) return `执行工具：${agentToolNameLabel(event.toolName ?? event.title.replace(/^Tool completed:\s*/, ''))}`
  if (event.kind === 'tool_call' && event.title.startsWith('Tool call failed:')) return `工具失败：${agentToolNameLabel(event.toolName ?? event.title.replace(/^Tool call failed:\s*/, ''))}`
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
  if (event.kind === 'tool_call' && event.toolName) return `调用 ${agentToolNameLabel(event.toolName)}`
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

  if (event.kind === 'tool_catalog') {
    const manifest = recordValue(data.manifest)
    const manifestTools = arrayValue(manifest?.tools)
    groups.push(group('刷新后的 manifest', [
      item('Manifest ID', stringValue(manifest?.id)),
      item('名称', stringValue(manifest?.name)),
      item('版本', stringValue(manifest?.version)),
      item('Profile', stringValue(manifest?.profileId)),
      item('Profile 版本', stringValue(manifest?.profileVersion)),
      item('工具授权数', numberValue(manifest?.toolCount) ?? manifestTools?.length),
      item('工具授权', formatManifestToolGrants(manifestTools)),
    ]))
    const capabilitySnapshot = recordValue(data.capabilitySnapshot)
    groups.push(group('关键工具状态', formatCatalogKeyTools(arrayValue(capabilitySnapshot?.keyTools))))
    groups.push(group('可用和阻塞工具', [
      item('可用工具', arrayValue(capabilitySnapshot?.availableToolNames)?.join(', ') ?? arrayValue(data.availableToolNames)?.join(', ')),
      item('阻塞工具', formatCatalogBlockedTools(arrayValue(capabilitySnapshot?.blockedTools))),
      item('激活技能', arrayValue(data.skillIds)?.join(', ')),
      item('警告数', numberValue(data.warningCount)),
    ]))
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
      item('工具', agentToolNameWithId(event.toolName)),
      item('来源', stringValue(data.source)),
      item('耗时', formatTraceEventDuration(event, data)),
      item('沙箱', booleanLabel(data.sandboxed)),
    ]))
  }

  return groups.filter((entry) => entry.items.length > 0)
}

function formatManifestToolGrants(value: unknown[] | undefined): string | undefined {
  const grants = value?.flatMap((entry) => {
    const grant = recordValue(entry)
    const name = stringValue(grant?.name)
    const mode = stringValue(grant?.mode)
    if (!name || !mode) return []
    const approval = stringValue(grant?.approval)
    return [`${name}:${mode}${approval ? `/${approval}` : ''}`]
  }) ?? []
  if (grants.length === 0) return undefined
  return grants.length > 20 ? `${grants.slice(0, 20).join(', ')} ... (+${grants.length - 20})` : grants.join(', ')
}

function formatCatalogKeyTools(value: unknown[] | undefined): Array<{ label: string; value?: string }> {
  return value?.flatMap((entry) => {
    const tool = recordValue(entry)
    const name = stringValue(tool?.name)
    if (!name) return []
    const status = tool?.available === true ? 'available' : 'blocked'
    const granted = tool?.granted === true ? 'granted' : 'not_granted'
    const reason = stringValue(tool?.unavailableReason)
    const approval = stringValue(tool?.approval)
    return item(name, [status, granted, reason, approval ? `approval=${approval}` : undefined].filter(Boolean).join(' / '))
  }) ?? []
}

function formatCatalogBlockedTools(value: unknown[] | undefined): string | undefined {
  const tools = value?.flatMap((entry) => {
    const tool = recordValue(entry)
    const name = stringValue(tool?.name)
    if (!name) return []
    const reason = stringValue(tool?.unavailableReason)
    const granted = tool?.granted === true ? 'granted' : 'not_granted'
    return [`${name}${reason ? `:${reason}` : ''}/${granted}`]
  }) ?? []
  if (tools.length === 0) return undefined
  return tools.length > 20 ? `${tools.slice(0, 20).join(', ')} ... (+${tools.length - 20})` : tools.join(', ')
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
    toolName: agentToolNameWithId(event.toolName),
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
