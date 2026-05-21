import type { AgentRun } from '@/lib/localAgentClient'
import type { ChatMessage, ChatRunActivity } from '@/store/agentStore'

export type AgentInputAnswer = { choiceIds?: string[]; text?: string }
export type AgentPendingInputRequest = NonNullable<AgentRun['pendingInputRequests']>[number]
export type AgentPendingApprovalRequest = NonNullable<AgentRun['pendingApprovals']>[number]

export function firstPendingInputRequest(run: AgentRun | null | undefined): AgentPendingInputRequest | null {
  return run?.pendingInputRequests?.find((request) => request.status === 'pending') ?? null
}

export function runHasWorkflowInteraction(run: AgentRun | null | undefined): boolean {
  if (!run) return false
  return (run.pendingInputRequests ?? []).some((request) => request.status === 'pending' || request.status === 'answered' || request.status === 'cancelled')
    || (run.pendingApprovals ?? []).some((approval) => approval.status === 'pending' || approval.status === 'approved' || approval.status === 'rejected')
}

export function optimisticApprovalRun(run: AgentRun, approvalIds: string[] | undefined, status: AgentPendingApprovalRequest['status']): AgentRun {
  const now = new Date().toISOString()
  const targetIds = new Set(approvalIds?.length
    ? approvalIds
    : (run.pendingApprovals ?? []).filter((approval) => approval.status === 'pending').map((approval) => approval.id))
  return {
    ...run,
    pendingApprovals: (run.pendingApprovals ?? []).map((approval) => {
      if (!targetIds.has(approval.id) || approval.status !== 'pending') return approval
      return {
        ...approval,
        status,
        updatedAt: now,
        ...(status === 'approved' ? { approvedAt: now } : {}),
        ...(status === 'rejected' ? { rejectedAt: now } : {}),
      }
    }),
  }
}

export function optimisticInputAnswerRun(run: AgentRun, requestId: string, answer: AgentInputAnswer): AgentRun {
  const now = new Date().toISOString()
  return {
    ...run,
    pendingInputRequests: (run.pendingInputRequests ?? []).map((request) => {
      if (request.id !== requestId || request.status !== 'pending') return request
      return {
        ...request,
        status: 'answered',
        updatedAt: now,
        answeredAt: now,
        answer,
      }
    }),
  }
}

export function upsertWorkflowRunSnapshot(current: AgentRun[], nextRun: AgentRun): AgentRun[] {
  return [...current.filter((run) => run.id !== nextRun.id), nextRun]
}

export function workflowRunsForChat(submittedRuns: AgentRun[], actionableRuns: AgentRun[] | AgentRun | null): AgentRun[] {
  const nextRuns = Array.isArray(actionableRuns) ? actionableRuns : actionableRuns ? [actionableRuns] : []
  const merged = [...submittedRuns]
  const seen = new Set(merged.map((run) => run.id))
  for (const run of nextRuns) {
    if (seen.has(run.id)) continue
    seen.add(run.id)
    merged.push(run)
  }
  return merged
}

export function workflowAnswerEchoesForMessages(messages: ChatMessage[], workflowRuns: AgentRun[]): Set<string> {
  const echoes = new Set<string>()
  for (const run of workflowRuns) {
    for (const echo of inputAnswerEchoesFromRun(run)) echoes.add(echo)
  }
  for (const message of messages) {
    const run = workflowRunFromActivity(message.meta?.localRunActivity)
    if (!run) continue
    for (const echo of inputAnswerEchoesFromRun(run)) echoes.add(echo)
  }
  return echoes
}

export function isWorkflowAnswerEchoMessage(message: ChatMessage, echoes: Set<string>): boolean {
  return message.role === 'user' && echoes.has(message.content.trim())
}

export function workflowRunFromActivity(activity: ChatRunActivity | undefined): AgentRun | null {
  if (!activity) return null
  const pendingInputRequests = (activity.inputs ?? [])
    .map((request) => {
      const status = normalizedInputRequestStatus(request.status)
      const inputType = normalizedInputType(request.inputType)
      if (!status || !inputType) return null
      return {
        id: request.id,
        runId: request.runId ?? activity.runId,
        title: request.title,
        ...(request.summary ? { summary: request.summary } : {}),
        question: request.question,
        inputType,
        choices: request.choices,
        allowCustomAnswer: request.allowCustomAnswer,
        status,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
        ...(request.answeredAt ? { answeredAt: request.answeredAt } : {}),
        ...(request.answer ? { answer: request.answer } : {}),
      } satisfies AgentPendingInputRequest
    })
    .filter((request): request is AgentPendingInputRequest => Boolean(request))
  const pendingApprovals = (activity.approvals ?? [])
    .map((approval) => {
      const status = normalizedApprovalStatus(approval.status)
      if (!status) return null
      return {
        id: approval.id,
        runId: approval.runId ?? activity.runId,
        toolName: approval.toolName,
        ...(approval.args ? { args: approval.args } : {}),
        ...(approval.preview !== undefined ? { preview: approval.preview } : {}),
        reason: approval.reason,
        ...(approval.risk ? { risk: approval.risk } : {}),
        ...(approval.permission ? { permission: approval.permission } : {}),
        status,
        createdAt: approval.createdAt,
        updatedAt: approval.updatedAt,
        ...(approval.approvedAt ? { approvedAt: approval.approvedAt } : {}),
        ...(approval.rejectedAt ? { rejectedAt: approval.rejectedAt } : {}),
      } satisfies AgentPendingApprovalRequest
    })
    .filter((approval): approval is AgentPendingApprovalRequest => Boolean(approval))
  if (pendingInputRequests.length === 0 && pendingApprovals.length === 0) return null
  return {
    id: activity.runId,
    threadId: activity.threadId,
    status: normalizedAgentRunStatus(activity.status),
    pendingInputRequests,
    pendingApprovals,
    policy: {
      approvalMode: 'interactive',
      maxToolCalls: 0,
      maxIterations: 0,
      allowNetwork: false,
      allowFileBytes: false,
    },
    createdAt: activity.createdAt,
    updatedAt: activity.updatedAt,
    ...(activity.startedAt ? { startedAt: activity.startedAt } : {}),
    ...(activity.completedAt ? { completedAt: activity.completedAt } : {}),
    ...(activity.failedAt ? { failedAt: activity.failedAt } : {}),
    ...(activity.error ? { error: activity.error } : {}),
    ...(activity.warnings?.length ? { warnings: activity.warnings } : {}),
    steps: [],
    traceEvents: [],
  }
}

export function formatInputAnswerForChat(request: AgentPendingInputRequest, answer: AgentInputAnswer): string {
  const selected = (answer.choiceIds ?? [])
    .map((choiceId) => request.choices.find((choice) => choice.id === choiceId))
    .filter((choice): choice is AgentPendingInputRequest['choices'][number] => Boolean(choice))
  const lines = [
    '[用户补充信息]',
    `标题：${request.title}`,
    request.summary ? `简介：${request.summary}` : undefined,
    `问题：${request.question}`,
  ].filter((line): line is string => Boolean(line))
  if (selected.length > 0) {
    lines.push('选择：')
    for (const choice of selected) {
      lines.push(`- ${choice.label}${choice.description ? `：${choice.description}` : ''}`)
    }
  }
  const text = answer.text?.trim()
  if (text) lines.push(`输入：${text}`)
  return lines.join('\n')
}

function inputAnswerEchoesFromRun(run: AgentRun): string[] {
  return (run.pendingInputRequests ?? [])
    .flatMap((request) => request.answer ? [
      formatInputAnswerForChat(request, request.answer),
      legacyInputAnswerEcho(request, request.answer),
    ] : [])
    .filter((content) => content.trim().length > 0)
}

function legacyInputAnswerEcho(request: AgentPendingInputRequest, answer: AgentInputAnswer): string {
  const selected = (answer.choiceIds ?? [])
    .map((choiceId) => request.choices.find((choice) => choice.id === choiceId))
    .filter((choice): choice is AgentPendingInputRequest['choices'][number] => Boolean(choice))
  const lines = [
    `回答：${request.title}`,
    ...selected.map((choice) => `选择：${choice.label}`),
    answer.text?.trim() ? `补充：${answer.text.trim()}` : undefined,
  ].filter((line): line is string => Boolean(line))
  return lines.join('\n')
}

function normalizedInputRequestStatus(status: string): AgentPendingInputRequest['status'] | null {
  if (status === 'pending' || status === 'answered' || status === 'cancelled') return status
  return null
}

function normalizedInputType(inputType: string): AgentPendingInputRequest['inputType'] | null {
  if (inputType === 'choice' || inputType === 'text' || inputType === 'confirmation') return inputType
  return null
}

function normalizedApprovalStatus(status: string): AgentPendingApprovalRequest['status'] | null {
  if (status === 'pending' || status === 'approved' || status === 'rejected') return status
  return null
}

function normalizedAgentRunStatus(status: string): AgentRun['status'] {
  if (
    status === 'queued'
    || status === 'in_progress'
    || status === 'requires_action'
    || status === 'completed'
    || status === 'completed_with_warnings'
    || status === 'failed'
    || status === 'cancelled'
  ) return status
  return 'completed'
}
