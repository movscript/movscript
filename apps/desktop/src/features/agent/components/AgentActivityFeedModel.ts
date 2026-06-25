import type {
  AgentActivityDebugDetail,
  AgentActivityItem,
  AgentActivityKind,
} from '@/features/agent/presentation/agentActivityFeed'

export interface AgentActivityItemRenderEntry {
  id: string
  type: 'item'
  item: AgentActivityItem
}

export interface AgentActivityPagedRenderEntry {
  id: string
  type: 'paged'
  items: AgentActivityItem[]
}

export type AgentActivityRenderEntry = AgentActivityItemRenderEntry | AgentActivityPagedRenderEntry

export function activityRoundRenderEntries(items: AgentActivityItem[]): AgentActivityRenderEntry[] {
  const entries: AgentActivityRenderEntry[] = []
  let group: AgentActivityItem[] = []

  function flushGroup() {
    if (group.length === 0) return
    if (group.length === 1) {
      entries.push({ id: group[0].id, type: 'item', item: group[0] })
    } else {
      entries.push({ id: `paged-${group[0].id}-${group.length}`, type: 'paged', items: group })
    }
    group = []
  }

  for (const item of items) {
    if (isPagedActivityItem(item)) {
      group.push(item)
      continue
    }
    flushGroup()
    entries.push({ id: item.id, type: 'item', item })
  }
  flushGroup()
  return entries
}

function isPagedActivityItem(item: AgentActivityItem): boolean {
  return item.type === 'block'
    || item.type === 'decision'
    || item.type === 'input_request'
    || item.type === 'approval_request'
}

export function formatDebugDetail(detail: AgentActivityDebugDetail): string {
  const sections: string[] = []
  if (detail.args !== undefined) sections.push(`参数\n${safeJSONStringify(detail.args)}`)
  if (detail.result !== undefined) sections.push(`返回\n${safeJSONStringify(detail.result)}`)
  if (detail.error) sections.push(`错误\n${detail.error}`)
  return sections.join('\n\n')
}

function safeJSONStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return '--'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`
}

export function kindLabel(kind: AgentActivityKind): string {
  if (kind === 'read') return '读取'
  if (kind === 'workspace') return '工作区'
  if (kind === 'write') return '写入'
  if (kind === 'task') return '任务'
  if (kind === 'system') return '系统'
  if (kind === 'error') return '错误'
  return '处理'
}
