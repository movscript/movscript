import type {
  AgentApprovalRequest,
  AgentInputRequest,
  AgentRun,
  AnswerRunInputRequestInput,
  ApproveRunInput,
  RejectRunInput,
} from './types.js'

export interface ApprovedRunInteraction {
  pendingApprovals: AgentApprovalRequest[]
  approvedToolNames: string[]
  selectedApprovalIds: string[]
  selectedToolNames: string[]
  approvingAll: boolean
}

export interface RejectedRunInteraction {
  pendingApprovals: AgentApprovalRequest[]
  selectedApprovalIds: string[]
  rejectedToolNames: string[]
  rejectingAll: boolean
}

export interface AnsweredRunInputInteraction {
  pendingInputRequests: AgentInputRequest[]
  request: AgentInputRequest
  choiceIds: string[]
  text?: string
}

export interface CancelledRunInteractions {
  pendingApprovals: AgentApprovalRequest[]
  pendingInputRequests: AgentInputRequest[]
}

export interface AppliedRequiredRunAction {
  pendingInputCount: number
}

export function applyApprovedRunInteraction(run: AgentRun, approval: ApprovedRunInteraction, now: string): AgentRun {
  run.pendingApprovals = approval.pendingApprovals
  run.metadata = { ...(run.metadata ?? {}), approvedToolNames: [...approval.approvedToolNames] }
  run.status = 'queued'
  run.updatedAt = now
  return run
}

export function applyAnsweredRunInputInteraction(run: AgentRun, answer: AnsweredRunInputInteraction, now: string): AgentRun {
  run.pendingInputRequests = answer.pendingInputRequests
  run.status = 'queued'
  run.updatedAt = now
  return run
}

export function rejectedRunInteractionWarning(rejection: RejectedRunInteraction): string {
  return `用户拒绝执行工具：${rejection.rejectedToolNames.join(', ') || 'unknown'}`
}

export function applyRejectedRunInteraction(run: AgentRun, rejection: RejectedRunInteraction, input: {
  now: string
  assistantMessageId: string
  warning?: string
}): AgentRun {
  const warning = input.warning ?? rejectedRunInteractionWarning(rejection)
  run.pendingApprovals = rejection.pendingApprovals
  run.warnings = Array.from(new Set([...(run.warnings ?? []), warning]))
  run.assistantMessageId = input.assistantMessageId
  run.status = 'completed_with_warnings'
  run.completedAt = input.now
  run.updatedAt = input.now
  return run
}

export function applyRequiredRunAction(run: AgentRun, input: {
  pendingApprovals: AgentApprovalRequest[]
  pendingInputRequests?: AgentInputRequest[]
  warnings: string[]
  now: string
}): AppliedRequiredRunAction {
  run.pendingApprovals = mergePendingApprovals(run.pendingApprovals ?? [], input.pendingApprovals, input.now)
  run.pendingInputRequests = mergePendingInputRequests(run.pendingInputRequests ?? [], input.pendingInputRequests ?? [], input.now)
  run.warnings = input.warnings.length > 0 ? [...input.warnings] : undefined
  run.status = 'requires_action'
  run.updatedAt = input.now
  return {
    pendingInputCount: run.pendingInputRequests.filter((request) => request.status === 'pending').length,
  }
}

export function approveRunInteraction(run: AgentRun, input: ApproveRunInput, now: string): ApprovedRunInteraction {
  assertRunRequiresAction(run, 'approval')
  const selectedApprovalIds = normalizeStringArray(input.approvalIds)
  const selectedToolNames = normalizeStringArray(input.approvedToolNames)
  const selectedApprovalIdSet = new Set(selectedApprovalIds)
  const selectedToolNameSet = new Set(selectedToolNames)
  const approvingAll = selectedApprovalIds.length === 0 && selectedToolNames.length === 0
  const approvedToolNames = new Set([
    ...getApprovedToolNames(run),
    ...(run.pendingApprovals ?? []).filter((approval) => approval.status === 'approved').map((approval) => approval.toolName),
  ])
  const pendingApprovals = (run.pendingApprovals ?? []).map((approval) => {
    const approve = approval.status === 'pending'
      && (approvingAll || selectedApprovalIdSet.has(approval.id) || selectedToolNameSet.has(approval.toolName))
    if (!approve) return approval
    approvedToolNames.add(approval.toolName)
    return { ...approval, status: 'approved' as const, approvedAt: now, updatedAt: now }
  })
  return {
    pendingApprovals,
    approvedToolNames: Array.from(approvedToolNames),
    selectedApprovalIds,
    selectedToolNames,
    approvingAll,
  }
}

export function rejectRunInteraction(run: AgentRun, input: RejectRunInput, now: string): RejectedRunInteraction {
  assertRunRequiresAction(run, 'approval')
  const selectedApprovalIds = normalizeStringArray(input.approvalIds)
  const selectedApprovalIdSet = new Set(selectedApprovalIds)
  const rejectingAll = selectedApprovalIds.length === 0
  const rejectedToolNames: string[] = []
  const pendingApprovals = (run.pendingApprovals ?? []).map((approval) => {
    const reject = approval.status === 'pending' && (rejectingAll || selectedApprovalIdSet.has(approval.id))
    if (!reject) return approval
    rejectedToolNames.push(approval.toolName)
    return { ...approval, status: 'rejected' as const, rejectedAt: now, updatedAt: now }
  })
  return { pendingApprovals, selectedApprovalIds, rejectedToolNames, rejectingAll }
}

export function answerRunInputInteraction(run: AgentRun, input: AnswerRunInputRequestInput, now: string): AnsweredRunInputInteraction {
  assertRunRequiresAction(run, 'user input')
  const pendingInputs = (run.pendingInputRequests ?? []).filter((request) => request.status === 'pending')
  if (pendingInputs.length === 0) throw new Error(`run ${run.id} has no pending user input request`)
  const requestId = typeof input.requestId === 'string' && input.requestId.trim() ? input.requestId.trim() : undefined
  const request = requestId
    ? pendingInputs.find((item) => item.id === requestId)
    : pendingInputs[0]
  if (!request) throw new Error(`input request not found: ${requestId}`)

  const choiceIds = normalizeStringArray(input.choiceIds).filter((choiceId) => request.choices.some((choice) => choice.id === choiceId))
  const text = typeof input.text === 'string' && input.text.trim() ? input.text.trim() : undefined
  if (choiceIds.length === 0 && !text) throw new Error('input answer requires choiceIds or text')

  const pendingInputRequests = (run.pendingInputRequests ?? []).map((item) => {
    if (item.id !== request.id) return item
    return {
      ...item,
      status: 'answered' as const,
      answer: {
        ...(choiceIds.length > 0 ? { choiceIds } : {}),
        ...(text ? { text } : {}),
      },
      answeredAt: now,
      updatedAt: now,
    }
  })
  return { pendingInputRequests, request, choiceIds, ...(text ? { text } : {}) }
}

export function cancelPendingRunInteractions(run: AgentRun, now: string): CancelledRunInteractions {
  return {
    pendingApprovals: (run.pendingApprovals ?? []).map((approval) => (
      approval.status === 'pending'
        ? { ...approval, status: 'rejected' as const, rejectedAt: now, updatedAt: now }
        : approval
    )),
    pendingInputRequests: (run.pendingInputRequests ?? []).map((request) => (
      request.status === 'pending'
        ? { ...request, status: 'cancelled' as const, updatedAt: now }
        : request
    )),
  }
}

export function mergePendingApprovals(existing: AgentApprovalRequest[], next: AgentApprovalRequest[], updatedAt: string): AgentApprovalRequest[] {
  const nextByTool = new Map(next.map((approval) => [approval.toolName, approval]))
  const existingPendingTools = new Set<string>()
  const merged = existing.map((approval) => {
    if (approval.status !== 'pending') return approval
    existingPendingTools.add(approval.toolName)
    const nextApproval = nextByTool.get(approval.toolName)
    return nextApproval ? { ...approval, args: nextApproval.args, reason: nextApproval.reason, updatedAt } : approval
  })
  for (const approval of next) {
    if (existingPendingTools.has(approval.toolName)) continue
    merged.push(approval)
  }
  return merged
}

export function mergePendingInputRequests(existing: AgentInputRequest[], next: AgentInputRequest[], updatedAt: string): AgentInputRequest[] {
  const pending = existing.filter((request) => request.status === 'pending')
  const resolved = existing.filter((request) => request.status !== 'pending')
  const merged = [...pending]
  for (const request of next) {
    const currentIndex = merged.findIndex((item) => item.title === request.title && item.question === request.question)
    if (currentIndex >= 0) {
      merged[currentIndex] = { ...merged[currentIndex], summary: request.summary, choices: request.choices, updatedAt }
    } else {
      merged.push(request)
    }
  }
  return [...resolved, ...merged].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function formatInputAnswerMessage(request: AgentInputRequest, choiceIds: string[], text?: string): string {
  const choicesById = new Map(request.choices.map((choice) => [choice.id, choice]))
  const selected = choiceIds
    .map((choiceId) => choicesById.get(choiceId))
    .filter((choice): choice is AgentInputRequest['choices'][number] => Boolean(choice))
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
  if (text) lines.push(`输入：${text}`)
  return lines.join('\n')
}

function assertRunRequiresAction(run: AgentRun, interaction: string): void {
  if (run.status !== 'requires_action') throw new Error(`run ${run.id} is not waiting for ${interaction}`)
}

export function getApprovedToolNames(run: AgentRun): string[] {
  return normalizeStringArray(run.metadata?.approvedToolNames)
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)))
}
