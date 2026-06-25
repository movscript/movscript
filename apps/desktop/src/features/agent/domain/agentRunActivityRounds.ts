import type { AgentTimelineActivity, AgentTimelineActivityApproval, AgentTimelineActivityEvent, AgentTimelineActivityInputRequest, AgentTimelineActivityStep } from '@movscript/agent-protocol'
import type { AgentRunActivityDecision, AgentRunActivityDecisionToolCall, AgentRunActivityRound, AgentRunActivityRoundIndex, AgentRunActivityToolExecution } from './agentConversationTypes'
import { isRecord } from './agentConversationUtils'

export function buildAgentRunActivityRoundIndex(activity: AgentTimelineActivity): AgentRunActivityRoundIndex {
  const decisions = timelineDecisions(activity.events ?? [])
  const toolExecutions = timelineToolExecutions(activity, decisions)
  const inputs = [...(activity.inputs ?? [])].sort(compareTimelineInputs)
  const roundSeeds = timelineRoundSeeds(activity, decisions, toolExecutions, inputs)
  const rounds = roundSeeds.map((round) => {
    const roundDecisions = decisions
      .filter((decision) => timelineRoundKeyForItem(decision.event, roundSeeds) === round.id)
      .sort(compareTimelineDecisions)
    const roundTools = toolExecutions
      .filter((tool) => timelineRoundKeyForItem(tool, roundSeeds) === round.id)
      .sort(compareTimelineToolExecutions)
    const roundInputs = inputs
      .filter((input) => timelineRoundKeyForItem(input, roundSeeds) === round.id)
      .sort(compareTimelineInputs)
    return {
      ...round,
      decisions: roundDecisions,
      toolExecutions: roundTools,
      inputs: roundInputs,
    }
  })
  const assignedInputIds = new Set(rounds.flatMap((round) => round.inputs.map((input) => input.id)))
  return {
    runId: activity.runId,
    threadId: activity.threadId,
    status: activity.status,
    createdAt: activity.createdAt,
    updatedAt: activity.updatedAt,
    rounds,
    unassignedInputs: inputs.filter((input) => !assignedInputIds.has(input.id)),
  }
}

function timelineDecisions(events: AgentTimelineActivityEvent[]): AgentRunActivityDecision[] {
  return events.flatMap((event) => {
    if (event.kind !== 'model_call' || event.title !== 'Model tool calls requested') return []
    const data = isRecord(event.data) ? event.data : undefined
    const toolCalls = Array.isArray(data?.tool_calls)
      ? data.tool_calls
          .map((call) => timelineDecisionToolCall(isRecord(call) ? call : undefined))
          .filter((call): call is AgentRunActivityDecisionToolCall => Boolean(call))
      : []
    if (toolCalls.length === 0) return []
    return [{
      id: `decision-${event.id}`,
      event,
      toolCalls,
    }]
  }).sort(compareTimelineDecisions)
}

function timelineDecisionToolCall(call: Record<string, unknown> | undefined): AgentRunActivityDecisionToolCall | undefined {
  const name = typeof call?.name === 'string' && call.name.trim() ? call.name.trim() : undefined
  if (!name) return undefined
  const id = typeof call?.id === 'string' && call.id.trim() ? call.id.trim() : undefined
  return {
    ...(id ? { id } : {}),
    name,
  }
}

function timelineToolExecutions(
  activity: AgentTimelineActivity,
  decisions: AgentRunActivityDecision[],
): AgentRunActivityToolExecution[] {
  const decisionOrderCandidates = timelineDecisionOrderCandidates(decisions)
  const eventsByStep = new Map<string, AgentTimelineActivityEvent[]>()
  for (const event of activity.events ?? []) {
    if (!event.stepId) continue
    const events = eventsByStep.get(event.stepId) ?? []
    events.push(event)
    eventsByStep.set(event.stepId, events)
  }

  const steps = activity.steps ?? []
  const events = activity.events ?? []
  const executions: AgentRunActivityToolExecution[] = steps
    .filter((step) => step.type === 'tool_call' && typeof step.toolName === 'string' && step.toolName.trim())
    .map((step, stepIndex) => ({
      id: `step-${step.id}`,
      toolName: step.toolName!,
      activityOrder: stepIndex,
      createdAt: step.createdAt,
      ...(step.completedAt ? { completedAt: step.completedAt } : {}),
      ...(step.roundIndex !== undefined ? { roundIndex: step.roundIndex } : {}),
      ...(step.roundLabel ? { roundLabel: step.roundLabel } : {}),
      ...(step.roundSource ? { roundSource: step.roundSource } : {}),
      step,
      events: (eventsByStep.get(step.id) ?? []).sort(compareTimelineEvents),
      approvals: [],
    }))

  const coveredStepIds = new Set(steps.map((step) => step.id))
  for (const event of events) {
    if (event.kind !== 'tool_call' || !event.toolName || event.title === 'Model tool call delta') continue
    if (event.stepId && coveredStepIds.has(event.stepId)) continue
    executions.push({
      id: `event-${event.id}`,
      toolName: event.toolName,
      activityOrder: steps.length + events.findIndex((candidate) => candidate.id === event.id),
      createdAt: event.createdAt,
      ...(event.completedAt ? { completedAt: event.completedAt } : {}),
      ...(event.roundIndex !== undefined ? { roundIndex: event.roundIndex } : {}),
      ...(event.roundLabel ? { roundLabel: event.roundLabel } : {}),
      ...(event.roundSource ? { roundSource: event.roundSource } : {}),
      events: [event],
      approvals: [],
    })
  }

  const approvals = [...(activity.approvals ?? [])].sort(compareTimelineApprovals)
  for (const [approvalIndex, approval] of approvals.entries()) {
    const match = findTimelineApprovalExecution(executions, approval)
    if (match) {
      match.approvals.push(approval)
      if (timelineTime(approval.createdAt) < timelineTime(match.createdAt)) match.createdAt = approval.createdAt
      continue
    }
    executions.push({
      id: `approval-${approval.id}`,
      toolName: approval.toolName,
      activityOrder: steps.length + events.length + approvalIndex,
      createdAt: approval.createdAt,
      approvals: [approval],
      events: [],
    })
  }

  for (const execution of executions) {
    const decisionMatch = timelineDecisionMatchForExecution(execution, decisionOrderCandidates)
    if (decisionMatch) {
      execution.decisionOrder = decisionMatch.order
      if (execution.roundIndex === undefined && decisionMatch.roundIndex !== undefined) execution.roundIndex = decisionMatch.roundIndex
      if (!execution.roundLabel && decisionMatch.roundLabel) execution.roundLabel = decisionMatch.roundLabel
      if (!execution.roundSource && decisionMatch.roundSource) execution.roundSource = decisionMatch.roundSource
    }
    execution.approvals.sort(compareTimelineApprovals)
  }
  return executions.sort(compareTimelineToolExecutions)
}

interface TimelineDecisionOrderCandidate {
  order: number
  toolName: string
  roundIndex?: number
  roundLabel?: string
  roundSource?: AgentTimelineActivityEvent['roundSource']
  used: boolean
}

function timelineDecisionOrderCandidates(decisions: AgentRunActivityDecision[]): TimelineDecisionOrderCandidate[] {
  let order = 0
  return [...decisions].sort(compareTimelineDecisions).flatMap((decision) => (
    decision.toolCalls.map((call) => ({
      order: order++,
      toolName: call.name,
      ...(decision.event.roundIndex !== undefined ? { roundIndex: decision.event.roundIndex } : {}),
      ...(decision.event.roundLabel ? { roundLabel: decision.event.roundLabel } : {}),
      ...(decision.event.roundSource ? { roundSource: decision.event.roundSource } : {}),
      used: false,
    }))
  ))
}

function timelineDecisionMatchForExecution(
  execution: AgentRunActivityToolExecution,
  candidates: TimelineDecisionOrderCandidate[],
): TimelineDecisionOrderCandidate | undefined {
  const sameTool = candidates.filter((candidate) => !candidate.used && candidate.toolName === execution.toolName)
  if (sameTool.length === 0) return undefined
  const roundMatched = execution.roundIndex !== undefined
    ? sameTool.filter((candidate) => candidate.roundIndex === execution.roundIndex)
    : []
  const candidate = [...(roundMatched.length > 0 ? roundMatched : sameTool)]
    .sort((left, right) => left.order - right.order)[0]
  if (!candidate) return undefined
  candidate.used = true
  return candidate
}

function findTimelineApprovalExecution(
  executions: AgentRunActivityToolExecution[],
  approval: AgentTimelineActivityApproval,
): AgentRunActivityToolExecution | undefined {
  const sameTool = executions.filter((execution) => execution.toolName === approval.toolName)
  if (sameTool.length === 0) return undefined
  const approvalTime = timelineTime(approval.createdAt)
  return [...sameTool].sort((left, right) => (
    Math.abs(timelineTime(left.createdAt) - approvalTime) - Math.abs(timelineTime(right.createdAt) - approvalTime)
      || compareTimelineToolExecutions(left, right)
  ))[0]
}

function timelineRoundSeeds(
  activity: AgentTimelineActivity,
  decisions: AgentRunActivityDecision[],
  toolExecutions: AgentRunActivityToolExecution[],
  inputs: AgentTimelineActivityInputRequest[],
): Array<Omit<AgentRunActivityRound, 'decisions' | 'toolExecutions' | 'inputs'>> {
  const byId = new Map<string, Omit<AgentRunActivityRound, 'decisions' | 'toolExecutions' | 'inputs'>>()
  const ensureRound = (input: {
    id: string
    index?: number
    label?: string
    source?: AgentRunActivityRound['source']
    startedAt: string
    finishedAt?: string
    failed?: boolean
    finished?: boolean
  }) => {
    const current = byId.get(input.id)
    byId.set(input.id, {
      id: input.id,
      ...(input.index !== undefined ? { index: input.index } : current?.index !== undefined ? { index: current.index } : {}),
      ...(input.label ? { label: input.label } : current?.label ? { label: current.label } : {}),
      ...(input.source ? { source: input.source } : current?.source ? { source: current.source } : {}),
      startedAt: current && timelineTime(current.startedAt) <= timelineTime(input.startedAt) ? current.startedAt : input.startedAt,
      ...(input.finishedAt ?? current?.finishedAt ? { finishedAt: maxTimelineTimestamp(input.finishedAt, current?.finishedAt) } : {}),
      failed: Boolean(current?.failed || input.failed),
      finished: Boolean(current?.finished || input.finished),
    })
  }

  for (const event of activity.events ?? []) {
    if (event.roundIndex === undefined) continue
    ensureRound({
      id: timelineRoundId(event.roundIndex),
      index: event.roundIndex,
      ...(event.roundLabel ? { label: event.roundLabel } : {}),
      ...(event.roundSource ? { source: event.roundSource } : {}),
      startedAt: event.createdAt,
      ...(event.completedAt ? { finishedAt: event.completedAt } : {}),
      failed: timelineEventIsFailure(event),
      finished: event.status === 'completed',
    })
  }
  for (const decision of decisions) {
    if (decision.event.roundIndex === undefined) continue
    ensureRound({
      id: timelineRoundId(decision.event.roundIndex),
      index: decision.event.roundIndex,
      ...(decision.event.roundLabel ? { label: decision.event.roundLabel } : {}),
      ...(decision.event.roundSource ? { source: decision.event.roundSource } : {}),
      startedAt: decision.event.createdAt,
    })
  }
  for (const tool of toolExecutions) {
    if (tool.roundIndex === undefined) continue
    ensureRound({
      id: timelineRoundId(tool.roundIndex),
      index: tool.roundIndex,
      ...(tool.roundLabel ? { label: tool.roundLabel } : {}),
      ...(tool.roundSource ? { source: tool.roundSource } : {}),
      startedAt: tool.createdAt,
      ...(tool.completedAt ? { finishedAt: tool.completedAt } : {}),
      failed: tool.step?.status === 'failed' || tool.events.some((event) => event.status === 'failed' || event.status === 'blocked'),
      finished: tool.step?.status === 'completed' || tool.events.some((event) => event.status === 'completed'),
    })
  }

  const items = [
    ...decisions.map((decision) => decision.event),
    ...toolExecutions,
    ...inputs,
  ]
  for (const item of items) {
    if (timelineRoundKeyForItem(item, [...byId.values()]) !== 'round-unknown') continue
    ensureRound({ id: `round-time-${timelineTime(item.createdAt)}`, startedAt: item.createdAt })
  }
  if (byId.size === 0) ensureRound({ id: 'round-unknown', startedAt: activity.startedAt ?? activity.createdAt })

  return [...byId.values()].sort(compareTimelineRounds)
}

function timelineRoundKeyForItem(
  item: { createdAt: string; roundIndex?: number },
  rounds: Array<Pick<AgentRunActivityRound, 'id' | 'index' | 'startedAt'>>,
): string {
  if (item.roundIndex !== undefined) return timelineRoundId(item.roundIndex)
  const itemTime = timelineTime(item.createdAt)
  const explicitRounds = rounds
    .filter((round) => round.index !== undefined)
    .sort(compareTimelineRounds)
  const candidates = explicitRounds.length > 0 ? explicitRounds : [...rounds].sort(compareTimelineRounds)
  const round = [...candidates].reverse().find((candidate) => timelineTime(candidate.startedAt) <= itemTime)
  return round?.id ?? 'round-unknown'
}

function timelineRoundId(index: number): string {
  return `round-${index}`
}

function timelineEventIsFailure(event: AgentTimelineActivityEvent): boolean {
  if (event.status === 'failed') return true
  if (event.status !== 'blocked') return false
  return event.kind !== 'input' && event.kind !== 'approval'
}

function compareTimelineRounds(
  left: Pick<AgentRunActivityRound, 'id' | 'index' | 'startedAt'>,
  right: Pick<AgentRunActivityRound, 'id' | 'index' | 'startedAt'>,
): number {
  return (left.index ?? Number.MAX_SAFE_INTEGER) - (right.index ?? Number.MAX_SAFE_INTEGER)
    || timelineTime(left.startedAt) - timelineTime(right.startedAt)
    || left.id.localeCompare(right.id)
}

function compareTimelineDecisions(left: AgentRunActivityDecision, right: AgentRunActivityDecision): number {
  return compareTimelineEvents(left.event, right.event)
}

function compareTimelineToolExecutions(left: AgentRunActivityToolExecution, right: AgentRunActivityToolExecution): number {
  return (left.roundIndex ?? Number.MAX_SAFE_INTEGER) - (right.roundIndex ?? Number.MAX_SAFE_INTEGER)
    || (left.decisionOrder ?? Number.MAX_SAFE_INTEGER) - (right.decisionOrder ?? Number.MAX_SAFE_INTEGER)
    || (left.activityOrder ?? Number.MAX_SAFE_INTEGER) - (right.activityOrder ?? Number.MAX_SAFE_INTEGER)
    || timelineTime(left.createdAt) - timelineTime(right.createdAt)
    || left.id.localeCompare(right.id)
}

function compareTimelineInputs(left: AgentTimelineActivityInputRequest, right: AgentTimelineActivityInputRequest): number {
  return timelineTime(left.createdAt) - timelineTime(right.createdAt) || left.id.localeCompare(right.id)
}

function compareTimelineApprovals(left: AgentTimelineActivityApproval, right: AgentTimelineActivityApproval): number {
  return timelineTime(left.createdAt) - timelineTime(right.createdAt) || left.id.localeCompare(right.id)
}

function compareTimelineEvents(left: AgentTimelineActivityEvent, right: AgentTimelineActivityEvent): number {
  return timelineTime(left.createdAt) - timelineTime(right.createdAt) || left.id.localeCompare(right.id)
}

function maxTimelineTimestamp(left: string | undefined, right: string | undefined): string | undefined {
  if (!left) return right
  if (!right) return left
  return timelineTime(left) >= timelineTime(right) ? left : right
}

function timelineTime(value: string | undefined): number {
  const parsed = value ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : 0
}
