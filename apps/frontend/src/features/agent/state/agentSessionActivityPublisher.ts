import type { AgentRun } from '@movscript/core/agent/protocol'
import {
  publishAgentActivityEvent,
  type AgentActivityEventPayload,
  type AgentActivityStatus,
  type AgentActivityTopic,
} from '@/features/agent/application/agentActivityEvents'
import type {
  AgentConversationRuntimePatch,
  AgentStandaloneTaskState,
} from '@/features/agent/state/agentSessionRuntimeModel'
import type {
  AgentPageTaskRun,
  AgentPageTaskState,
} from '@/features/agent/state/agentSessionTaskModel'

export function publishAgentTaskActivity(
  topic: AgentActivityTopic,
  payload: AgentActivityEventPayload,
  dedupeKey: string,
): void {
  publishAgentActivityEvent(topic, payload, {
    id: `agent:${dedupeKey}`,
    source: 'agent-session-store',
  })
}

export function agentTaskActivityPayload(task: AgentPageTaskState, status: AgentActivityStatus): AgentActivityEventPayload {
  return {
    conversationId: task.conversationId,
    threadId: task.threadId,
    runId: task.runId,
    projectId: task.payload.projectId,
    activityId: task.requestId,
    kind: 'task',
    title: task.payload.title || task.payload.displayMessage || task.taskType,
    summary: task.error || task.payload.displayMessage || task.payload.message,
    status,
    origin: 'system',
    rawRef: { type: 'agent_page_task', id: task.requestId },
  }
}

export function agentActivityStatusFromPageTask(status: AgentPageTaskState['status']): AgentActivityStatus {
  switch (status) {
    case 'completed':
      return 'completed'
    case 'error':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    case 'queued':
      return 'pending'
    default:
      return 'running'
  }
}

export function agentActivityStatusFromStandaloneStatus(status: AgentStandaloneTaskState['status']): AgentActivityStatus {
  switch (status) {
    case 'completed':
      return 'completed'
    case 'error':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    case 'requires_action':
      return 'requires_action'
    default:
      return 'running'
  }
}

export function agentActivityStatusFromRun(run: AgentRun): AgentActivityStatus {
  switch (run.status) {
    case 'completed':
    case 'completed_with_warnings':
      return 'completed'
    case 'failed':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    case 'requires_action':
      return 'requires_action'
    default:
      return 'running'
  }
}

export function agentActivityTopicForStatus(status: AgentActivityStatus): AgentActivityTopic {
  switch (status) {
    case 'completed':
      return 'agent.activity.completed'
    case 'failed':
      return 'agent.activity.failed'
    default:
      return 'agent.activity.updated'
  }
}

export function agentRuntimeActivityTitle(patch: AgentConversationRuntimePatch): string {
  if (patch.error) return 'Agent run failed'
  if (patch.approving) return 'Agent waiting for approval'
  if (patch.stopping) return 'Agent stopping'
  if (patch.building) return 'Agent preparing request'
  if (patch.loading) return 'Agent running'
  return 'Agent runtime updated'
}

export function publishAgentRunStepActivity(
  conversationId: string | undefined,
  projectId: number | undefined,
  run: AgentRun | AgentPageTaskRun | undefined,
): void {
  if (!run || !('steps' in run) || !Array.isArray(run.steps)) return
  for (const step of run.steps) {
    if (!isAgentToolStep(step)) continue
    const status = agentToolStatus(step.status)
    publishAgentTaskActivity(agentToolTopicForStatus(status), {
      conversationId,
      threadId: run.threadId,
      runId: run.id,
      projectId,
      activityId: step.id,
      kind: 'tool_call',
      title: step.toolName || 'Agent tool',
      summary: typeof step.error === 'string' ? step.error : undefined,
      status,
      origin: 'agent-mcp',
      toolName: step.toolName,
      rawRef: { type: 'agent_run_step', id: step.id },
    }, `run:${run.id}:step:${step.id}:${status}`)
  }
}

export function publishAgentPlanActivity(conversationId: string, run: AgentRun): void {
  const planId = stringValue((run as unknown as { planId?: unknown }).planId)
    ?? stringValue((run as unknown as { plan?: { id?: unknown } }).plan?.id)
  const planSummary = stringValue((run as unknown as { planSummary?: unknown }).planSummary)
    ?? stringValue((run as unknown as { plan?: { summary?: unknown; title?: unknown } }).plan?.summary)
    ?? stringValue((run as unknown as { plan?: { title?: unknown } }).plan?.title)
  if (!planId && !planSummary) return
  publishAgentTaskActivity('agent.plan.updated', {
    conversationId,
    threadId: run.threadId,
    runId: run.id,
    activityId: planId ?? `${run.id}:plan`,
    kind: 'plan',
    title: 'Agent plan updated',
    summary: planSummary,
    status: agentActivityStatusFromRun(run),
    origin: 'agent',
    rawRef: { type: 'agent_run_plan', id: planId ?? run.id },
  }, `run:${run.id}:plan:${planId ?? planSummary ?? ''}`)
}

export function publishAgentRunInteractionRequests(
  conversationId: string | undefined,
  projectId: number | undefined,
  run: AgentRun | AgentPageTaskRun | undefined,
): void {
  if (!run || !('pendingInputRequests' in run || 'pendingApprovals' in run)) return
  const threadId = stringValue((run as { threadId?: unknown }).threadId)
  const runId = stringValue((run as { id?: unknown }).id)
  for (const request of Array.isArray((run as { pendingInputRequests?: unknown }).pendingInputRequests) ? (run as { pendingInputRequests: unknown[] }).pendingInputRequests : []) {
    if (!isPendingInteractionRequest(request)) continue
    publishAgentTaskActivity('agent.user-input.requested', {
      conversationId,
      threadId,
      runId,
      projectId,
      activityId: request.id,
      kind: 'user_input',
      title: request.title ?? 'Agent needs input',
      summary: request.prompt,
      status: 'requires_action',
      origin: 'agent',
      rawRef: { type: 'agent_pending_input_request', id: request.id },
    }, `run:${runId ?? 'unknown'}:input:${request.id}:${request.updatedAt ?? ''}`)
  }
  for (const approval of Array.isArray((run as { pendingApprovals?: unknown }).pendingApprovals) ? (run as { pendingApprovals: unknown[] }).pendingApprovals : []) {
    if (!isPendingInteractionRequest(approval)) continue
    publishAgentTaskActivity('agent.approval.requested', {
      conversationId,
      threadId,
      runId,
      projectId,
      activityId: approval.id,
      kind: 'approval',
      title: approval.title ?? 'Agent approval requested',
      summary: approval.prompt ?? approval.reason,
      status: 'requires_action',
      origin: 'agent',
      rawRef: { type: 'agent_pending_approval_request', id: approval.id },
    }, `run:${runId ?? 'unknown'}:approval:${approval.id}:${approval.updatedAt ?? ''}`)
  }
}

function isAgentToolStep(step: unknown): step is {
  id: string
  type: string
  status?: string
  toolName?: string
  error?: unknown
} {
  return !!step
    && typeof step === 'object'
    && (step as { type?: unknown }).type === 'tool_call'
    && typeof (step as { id?: unknown }).id === 'string'
}

function isPendingInteractionRequest(value: unknown): value is {
  id: string
  status?: string
  title?: string
  prompt?: string
  reason?: string
  updatedAt?: string
} {
  return !!value
    && typeof value === 'object'
    && typeof (value as { id?: unknown }).id === 'string'
    && ((value as { status?: unknown }).status === undefined || (value as { status?: unknown }).status === 'pending')
}

function agentToolStatus(status: string | undefined): AgentActivityStatus {
  switch (status) {
    case 'completed':
    case 'success':
      return 'completed'
    case 'failed':
    case 'error':
      return 'failed'
    case 'cancelled':
      return 'cancelled'
    case 'pending':
      return 'pending'
    default:
      return 'running'
  }
}

function agentToolTopicForStatus(status: AgentActivityStatus): AgentActivityTopic {
  switch (status) {
    case 'completed':
      return 'agent.tool.completed'
    case 'failed':
      return 'agent.tool.failed'
    default:
      return 'agent.tool.started'
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
