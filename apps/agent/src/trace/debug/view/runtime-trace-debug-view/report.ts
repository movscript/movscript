import type { AgentRun, AgentTraceEvent } from '../../../../state/shared/types.js'
import { buildDebugReadinessChecklist } from './coverage.js'
import { buildAttentionEvents } from './eventViews.js'
import { formatTimestamp, runRoleLabel, runStatusLabel } from './labels.js'
import type { AgentDebugCoverageSummary, AgentModelCallSummary } from './types.js'

export function buildDebugReportText(input: {
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
    `Token: ${input.coverage.tokenUsageLabel}`,
    `HTTP 响应: ${input.coverage.httpResponsesLabel}`,
    `请求摘要: ${input.coverage.requestPayloadsLabel}`,
    `响应摘要: ${input.coverage.httpResponseBodiesLabel}`,
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

export function debugBundleRunSnapshot(run: AgentRun): Omit<AgentRun, 'traceEvents'> {
  const { traceEvents: _traceEvents, ...snapshot } = run
  return snapshot
}

export function debugBundleRunSummary(run: AgentRun): Record<string, unknown> {
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
