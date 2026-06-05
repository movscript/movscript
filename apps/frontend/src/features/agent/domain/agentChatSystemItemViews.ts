import type { AgentChatThreadItem } from '@/features/agent/domain/agentChatThreadItems'

export type AgentChatSystemItemView = {
  title: string
  detail: string
  meta: Array<string | undefined | null | false>
  tone: 'neutral' | 'result' | 'process' | 'diagnostic'
  timeline: string[]
  actionContext: string[]
  reviewDetails?: unknown
  rawDetailsLabel?: string
  rawDetails?: unknown
}

type AgentChatSystemRenderableItem = Extract<AgentChatThreadItem, {
  type: 'reviewMode' | 'systemNotice' | 'approvalReview' | 'contextCompaction' | 'unknown'
}>

export function agentChatSystemItemView(item: AgentChatSystemRenderableItem): AgentChatSystemItemView {
  const tone = agentChatSystemTone(item)
  if (item.type === 'reviewMode') {
    return {
      title: `${item.action === 'entered' ? 'Entered' : 'Exited'} review mode`,
      detail: item.review,
      meta: [],
      tone,
      timeline: [],
      actionContext: [],
      ...(item.raw !== undefined ? { rawDetailsLabel: 'Review mode details', rawDetails: item.raw } : {}),
    }
  }
  if (item.type === 'systemNotice') {
    return {
      title: item.title,
      detail: item.detail ?? '',
      meta: [item.level, item.code, item.threadId ? `thread ${item.threadId}` : undefined, item.turnId ? `turn ${item.turnId}` : undefined],
      tone,
      timeline: [],
      actionContext: [],
      ...(item.raw !== undefined ? { rawDetailsLabel: 'Notice details', rawDetails: item.raw } : {}),
    }
  }
  if (item.type === 'approvalReview') {
    return {
      title: `Approval review ${item.lifecycle}`,
      detail: agentChatApprovalReviewDetail(item),
      meta: [item.reviewStatus, item.riskLevel, item.decisionSource],
      tone,
      timeline: agentChatApprovalReviewTimeline(item),
      actionContext: agentChatApprovalReviewActionContext(item.action),
      ...(item.review ? { reviewDetails: item.review } : {}),
      ...(item.raw !== undefined ? { rawDetailsLabel: 'Review details', rawDetails: item.raw } : {}),
    }
  }
  if (item.type === 'contextCompaction') {
    return {
      title: 'Context compacted',
      detail: agentChatContextCompactionDetail(item.raw),
      meta: [],
      tone,
      timeline: [],
      actionContext: [],
      rawDetailsLabel: 'Compaction details',
      rawDetails: item.raw,
    }
  }
  return {
    title: `Unknown item: ${item.providerType}`,
    detail: agentChatUnknownDetail(item.raw),
    meta: [],
    tone,
    timeline: [],
    actionContext: [],
    rawDetailsLabel: 'Raw item',
    rawDetails: item.raw,
  }
}

function agentChatSystemTone(item: AgentChatSystemRenderableItem): AgentChatSystemItemView['tone'] {
  if (item.type === 'systemNotice' && (item.level === 'error' || item.level === 'warning')) return 'diagnostic'
  if (item.type === 'approvalReview') {
    if (item.reviewStatus === 'denied' || item.reviewStatus === 'rejected' || item.reviewStatus === 'timedOut' || item.reviewStatus === 'aborted') return 'diagnostic'
    if (item.riskLevel === 'high' || item.riskLevel === 'critical') return 'diagnostic'
    if (item.reviewStatus === 'inProgress' || item.lifecycle === 'started') return 'process'
    if (item.reviewStatus === 'approved') return 'result'
  }
  if (item.type === 'contextCompaction') return 'process'
  return 'neutral'
}

function agentChatApprovalReviewDetail(item: Extract<AgentChatThreadItem, { type: 'approvalReview' }>): string {
  const action = agentChatApprovalReviewActionLabel(item.action)
  return [
    item.targetItemId ? `target: ${item.targetItemId}` : null,
    item.reviewStatus ? `status: ${item.reviewStatus}` : null,
    item.riskLevel ? `risk: ${item.riskLevel}` : null,
    item.decisionSource ? `decision: ${item.decisionSource}` : null,
    action ? `action: ${action}` : null,
    item.rationale ? `rationale: ${item.rationale}` : null,
  ].filter(Boolean).join('\n')
}

function agentChatApprovalReviewTimeline(item: Extract<AgentChatThreadItem, { type: 'approvalReview' }>): string[] {
  return [
    item.startedAtMs !== null ? `started: ${item.startedAtMs}` : '',
    item.completedAtMs !== undefined && item.completedAtMs !== null ? `completed: ${item.completedAtMs}` : '',
    item.startedAtMs !== null && item.completedAtMs !== undefined && item.completedAtMs !== null ? `duration: ${Math.max(0, item.completedAtMs - item.startedAtMs)}ms` : '',
  ]
}

function agentChatApprovalReviewActionLabel(action: unknown): string {
  if (!action || typeof action !== 'object') return ''
  const record = action as Record<string, unknown>
  const type = typeof record.type === 'string' ? record.type : ''
  if (!type) return ''
  if (type === 'command' && typeof record.command === 'string') return `${type}: ${record.command}`
  if (type === 'execve' && typeof record.program === 'string') return `${type}: ${record.program}`
  if (type === 'networkAccess' && typeof record.host === 'string') return `${type}: ${record.host}`
  if (type === 'applyPatch') return [type, arrayValue(record.files).length ? `${arrayValue(record.files).length} file(s)` : null].filter(Boolean).join(': ')
  if (type === 'mcpToolCall') return [type, record.server, record.toolName].filter((value) => typeof value === 'string' && value).join(': ')
  if (type === 'requestPermissions') return type
  return type
}

function agentChatApprovalReviewActionContext(action: unknown): string[] {
  if (!action || typeof action !== 'object') return []
  const record = action as Record<string, unknown>
  const type = stringValue(record.type)
  if (type === 'command') {
    return [
      stringValue(record.source) ? `source: ${stringValue(record.source)}` : '',
      stringValue(record.cwd) ? `cwd: ${stringValue(record.cwd)}` : '',
    ]
  }
  if (type === 'execve') {
    return [
      stringValue(record.source) ? `source: ${stringValue(record.source)}` : '',
      stringValue(record.cwd) ? `cwd: ${stringValue(record.cwd)}` : '',
      arrayValue(record.argv).length ? `argv: ${arrayValue(record.argv).join(' ')}` : '',
    ]
  }
  if (type === 'applyPatch') {
    return [
      stringValue(record.cwd) ? `cwd: ${stringValue(record.cwd)}` : '',
      ...arrayValue(record.files).map((file) => `file: ${file}`),
    ]
  }
  if (type === 'networkAccess') {
    return [
      stringValue(record.target) ? `target: ${stringValue(record.target)}` : '',
      stringValue(record.protocol) ? `protocol: ${stringValue(record.protocol)}` : '',
      typeof record.port === 'number' ? `port: ${record.port}` : '',
    ]
  }
  if (type === 'mcpToolCall') {
    return [
      stringValue(record.toolTitle) ? `title: ${stringValue(record.toolTitle)}` : '',
      stringValue(record.connectorName) ? `connector: ${stringValue(record.connectorName)}` : '',
    ]
  }
  if (type === 'requestPermissions') {
    return [
      stringValue(record.reason) ? `reason: ${stringValue(record.reason)}` : '',
      ...agentChatApprovalReviewPermissionContext(record.permissions),
    ]
  }
  return []
}

function agentChatApprovalReviewPermissionContext(value: unknown): string[] {
  if (!isRecord(value)) return value !== undefined ? [`permissions: ${agentChatValuePreview(value)}`] : []
  return [
    ...agentChatApprovalReviewNetworkPermissionContext(value.network),
    ...agentChatApprovalReviewFileSystemPermissionContext(value.fileSystem),
  ]
}

function agentChatApprovalReviewNetworkPermissionContext(value: unknown): string[] {
  if (!isRecord(value)) return []
  if (value.enabled === true) return ['network: enabled']
  if (value.enabled === false) return ['network: disabled']
  return ['network: requested']
}

function agentChatApprovalReviewFileSystemPermissionContext(value: unknown): string[] {
  if (!isRecord(value)) return []
  return [
    ...pathListContext('fs read', value.read),
    ...pathListContext('fs write', value.write),
    ...fileSystemEntryContext(value.entries),
    typeof value.globScanMaxDepth === 'number' ? `glob scan max depth: ${value.globScanMaxDepth}` : '',
  ]
}

function pathListContext(label: string, value: unknown): string[] {
  const paths = arrayValue(value)
  if (!paths.length) return []
  return [
    `${label}: ${paths.length} path(s)`,
    ...paths.slice(0, 3).map((path) => `${label}: ${path}`),
  ]
}

function fileSystemEntryContext(value: unknown): string[] {
  const entries = Array.isArray(value) ? value.filter(isRecord) : []
  if (!entries.length) return []
  return [
    `fs entries: ${entries.length}`,
    ...entries.slice(0, 4).map((entry) => {
      const access = stringValue(entry.access) ?? 'access'
      const path = stringValue(entry.path) ?? 'unknown'
      return `fs entry: ${access} ${path}`
    }),
  ]
}

function agentChatContextCompactionDetail(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return raw === undefined ? '' : String(raw)
  const record = raw as Record<string, unknown>
  return [
    stringValue(record.threadId) ? `thread: ${stringValue(record.threadId)}` : '',
    stringValue(record.turnId) ? `turn: ${stringValue(record.turnId)}` : '',
    stringValue(record.reason) ? `reason: ${stringValue(record.reason)}` : '',
    numberValue(record.previousTokens) !== undefined ? `previous tokens: ${numberValue(record.previousTokens)}` : '',
    numberValue(record.nextTokens) !== undefined ? `next tokens: ${numberValue(record.nextTokens)}` : '',
    numberValue(record.removedTokens) !== undefined ? `removed tokens: ${numberValue(record.removedTokens)}` : '',
    numberValue(record.compactedCount) !== undefined ? `compacted count: ${numberValue(record.compactedCount)}` : '',
  ].filter(Boolean).join('\n')
}

function agentChatUnknownDetail(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return String(raw)
  const record = raw as Record<string, unknown>
  return [
    stringValue(record.id) ? `id: ${stringValue(record.id)}` : '',
    stringValue(record.type) ? `provider type: ${stringValue(record.type)}` : '',
    stringValue(record.status) ? `status: ${stringValue(record.status)}` : '',
  ].filter(Boolean).join('\n')
}

function agentChatValuePreview(value: unknown): string {
  try {
    const preview = JSON.stringify(value, null, 2)
    if (!preview) return ''
    return preview.length > 1600 ? `${preview.slice(0, 1600)}...` : preview
  } catch {
    return String(value)
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function arrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((item) => stringValue(item) ?? []) : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
