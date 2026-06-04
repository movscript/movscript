import { agentToolNameLabel } from '@/features/agent/domain/agentToolDisplay'
import type { AgentActivityFeed } from './types'
import { compactLines, formatDuration, formatTokenUsage } from './format'

export function agentActivityFeedMarkdown(feed: AgentActivityFeed): string {
  const lines: string[] = []
  const runLabel = feed.runId ? `Run ${feed.runId}` : 'Run'
  lines.push(`### ${runLabel}`)
  if (feed.statusText) lines.push(`- ${feed.statusText}`)
  const totalLine = feedTotalsLine(feed)
  if (totalLine) lines.push(`- ${totalLine}`)
  const rounds = feed.rounds.length ? feed.rounds : [{ id: 'all', label: '活动', status: 'tool_calls' as const, items: feed.items }]
  for (const round of rounds) {
    lines.push(`- ${round.label}`)
    if (round.items.length === 0) {
      lines.push(`  - ${round.status === 'final' ? '形成最终回复' : '思考中'}`)
      continue
    }
    for (const item of round.items) {
      if (item.type === 'line') {
        lines.push(`  - ${item.text}${item.durationMs !== undefined ? `（${formatDuration(item.durationMs)}）` : ''}`)
        continue
      }
      if (item.type === 'input_request') {
        lines.push(`  - 需要输入：${item.request.title}`)
        lines.push(`    - ${item.request.question}`)
        continue
      }
      if (item.type === 'approval_request') {
        lines.push(`  - 需要确认：${agentToolNameLabel(item.approval.toolName)}`)
        if (item.approval.reason) lines.push(`    - ${item.approval.reason}`)
        continue
      }
      lines.push(`  - ${item.title}${item.durationMs !== undefined ? `（${formatDuration(item.durationMs)}）` : ''}`)
      for (const line of item.lines) lines.push(`    - ${line}`)
      if (item.type === 'block' && item.code) {
        lines.push(`    - ${item.code.label}:`)
        lines.push('```')
        lines.push(item.code.text)
        lines.push('```')
      }
    }
  }
  return lines.join('\n')
}

export function feedTotalsLine(feed: Pick<AgentActivityFeed, 'totals'>): string | undefined {
  const parts = compactLines([
    feed.totals.modelCallCount > 0 ? `模型 ${feed.totals.modelCallCount} 次` : undefined,
    feed.totals.toolCallCount > 0 ? `工具 ${feed.totals.toolCallCount} 次` : undefined,
    feed.totals.durationMs !== undefined ? formatDuration(feed.totals.durationMs) : undefined,
    feed.totals.usage ? formatTokenUsage(feed.totals.usage) : undefined,
  ])
  return parts.length ? `累计：${parts.join(' · ')}` : undefined
}

export function agentActivityTraceJSON(feed: AgentActivityFeed): string {
  return JSON.stringify({
    runId: feed.runId,
    status: feed.status,
    activity: feed.activity,
  }, null, 2)
}
