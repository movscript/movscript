import { approvalStatusLabel } from '@/features/agent/domain/agentRunUi'
import { recordArray, stringArray, stringValue } from '@/features/agent/domain/agent-run-page/runConfigurationSnapshot'
import { isRecord } from '@/shared/domain/jsonValue'
import type { AgentRun, AgentTraceEvent } from '@/shared/infrastructure/localAgentClient'

export interface AgentApprovalImpactItem {
  id: string
  toolName: string
  status: string
  statusLabel: string
  impact: string
  reason?: string
  risk?: string
  permission?: string
  createdAt?: string
  resolvedAt?: string
  eventIds: string[]
}

export interface AgentApprovalImpactSummary {
  items: AgentApprovalImpactItem[]
  requestedCount: number
  pendingCount: number
  approvedCount: number
  rejectedCount: number
}

export function buildApprovalImpactSummary(
  run: Pick<AgentRun, 'pendingApprovals'> | undefined,
  events: AgentTraceEvent[],
): AgentApprovalImpactSummary {
  const approvalEvents = events.filter((event) => event.kind === 'approval')
  const approvalEventIdsByApprovalId = new Map<string, string[]>()
  const requestEventIdsByToolName = new Map<string, string[]>()
  const resolvedStatusByApprovalId = new Map<string, { status: 'approved' | 'rejected'; resolvedAt?: string }>()

  for (const event of approvalEvents) {
    const data = isRecord(event.data) ? event.data : {}
    const eventType = stringValue(data.eventType)
    const outcome = stringValue(data.outcome)
    const approvalIds = approvalIdArray(data.approvalIds).concat(approvalIdArray(data.approvalId))
    const toolNames = approvalEventToolNames(event)

    for (const approvalId of approvalIds) {
      pushMapValue(approvalEventIdsByApprovalId, approvalId, event.id)
      if (eventType === 'approval.resolved') {
        const status = outcome === 'denied' || outcome === 'rejected' ? 'rejected' : outcome === 'approved' ? 'approved' : undefined
        if (status) resolvedStatusByApprovalId.set(approvalId, { status, resolvedAt: event.completedAt ?? event.createdAt })
      }
    }

    if (eventType === 'approval.requested') {
      for (const toolName of toolNames) pushMapValue(requestEventIdsByToolName, toolName, event.id)
    }
  }

  const approvals = run?.pendingApprovals ?? []
  const representedApprovalIds = new Set(approvals.map((approval) => approval.id))
  const representedToolNames = new Set(approvals.map((approval) => approval.toolName))
  const items: AgentApprovalImpactItem[] = approvals.map((approval) => {
    const resolvedStatus = resolvedStatusByApprovalId.get(approval.id)
    const status = approval.status === 'pending' && resolvedStatus ? resolvedStatus.status : approval.status
    return {
      id: approval.id,
      toolName: approval.toolName,
      status,
      statusLabel: approvalStatusLabel(status),
      impact: approvalRuntimeImpactLabel(status),
      reason: approval.reason,
      risk: approval.risk,
      permission: approval.permission,
      createdAt: approval.createdAt,
      resolvedAt: approval.approvedAt ?? approval.rejectedAt ?? resolvedStatus?.resolvedAt,
      eventIds: uniqueStrings([
        ...(approvalEventIdsByApprovalId.get(approval.id) ?? []),
        ...(requestEventIdsByToolName.get(approval.toolName) ?? []),
      ]),
    }
  })

  const traceOnlyItemsByToolName = new Map<string, AgentApprovalImpactItem>()
  for (const event of approvalEvents) {
    const data = isRecord(event.data) ? event.data : {}
    const eventType = stringValue(data.eventType)
    const outcome = stringValue(data.outcome)
    const approvalIds = approvalIdArray(data.approvalIds).concat(approvalIdArray(data.approvalId))
    if (approvalIds.some((approvalId) => representedApprovalIds.has(approvalId))) continue
    const status = eventType === 'approval.resolved'
      ? outcome === 'denied' || outcome === 'rejected'
        ? 'rejected'
        : outcome === 'approved'
          ? 'approved'
          : 'pending'
      : 'pending'
    const toolNames = approvalEventToolNames(event).filter((toolName) => !representedToolNames.has(toolName))
    if (toolNames.length === 0) continue
    for (const toolName of toolNames) {
      const existing = traceOnlyItemsByToolName.get(toolName)
      if (existing) {
        existing.eventIds = uniqueStrings([...existing.eventIds, event.id])
        if (existing.status === 'pending' || status !== 'pending') {
          existing.status = status
          existing.statusLabel = approvalStatusLabel(status)
          existing.impact = approvalRuntimeImpactLabel(status)
          existing.resolvedAt = status === 'pending' ? existing.resolvedAt : event.completedAt ?? event.createdAt
        }
        continue
      }
      const toolMeta = approvalEventToolMeta(event, toolName)
      traceOnlyItemsByToolName.set(toolName, {
        id: `trace:${toolName}`,
        toolName,
        status,
        statusLabel: approvalStatusLabel(status),
        impact: approvalRuntimeImpactLabel(status),
        reason: toolMeta.reason ?? event.summary ?? event.title,
        risk: toolMeta.risk,
        permission: toolMeta.permission,
        createdAt: event.createdAt,
        resolvedAt: status === 'pending' ? undefined : event.completedAt ?? event.createdAt,
        eventIds: [event.id],
      })
    }
  }
  items.push(...traceOnlyItemsByToolName.values())

  return {
    items,
    requestedCount: items.length,
    pendingCount: items.filter((item) => item.status === 'pending').length,
    approvedCount: items.filter((item) => item.status === 'approved').length,
    rejectedCount: items.filter((item) => item.status === 'rejected').length,
  }
}

function approvalIdArray(value: unknown): string[] {
  if (Array.isArray(value)) return stringArray(value)
  const single = stringValue(value)
  return single ? [single] : []
}

function approvalEventToolNames(event: AgentTraceEvent): string[] {
  const data = isRecord(event.data) ? event.data : {}
  const directToolName = stringValue(event.toolName) ?? stringValue(data.toolName)
  const tools = recordArray(data.tools).flatMap((tool) => stringValue(tool.name) ?? [])
  return uniqueStrings([
    directToolName,
    ...tools,
    ...stringArray(data.toolNames),
    ...stringArray(data.approvedToolNames),
    ...stringArray(data.rejectedToolNames),
  ].filter((name): name is string => !!name))
}

function approvalEventToolMeta(event: AgentTraceEvent, toolName: string): { reason?: string; risk?: string; permission?: string } {
  const data = isRecord(event.data) ? event.data : {}
  const match = recordArray(data.tools).find((tool) => stringValue(tool.name) === toolName)
  if (!match) return {}
  return {
    reason: stringValue(match.reason) ?? stringValue(match.reasonPreview),
    risk: stringValue(match.risk),
    permission: stringValue(match.permission),
  }
}

function approvalRuntimeImpactLabel(status: string): string {
  if (status === 'approved') return '用户已批准；运行会带着已批准的工具调用继续执行。'
  if (status === 'rejected') return '用户已拒绝；这次工具调用不会执行，运行继续处理拒绝结果或以警告完成。'
  return '运行暂停等待审批；同意后会继续执行该工具，拒绝会阻止这次工具调用。'
}

function pushMapValue(map: Map<string, string[]>, key: string, value: string) {
  const existing = map.get(key)
  if (existing) existing.push(value)
  else map.set(key, [value])
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)))
}
