import type { AgentStore } from '../../../../state/store/core/store.js'
import type {
  AgentApprovalRequest,
  AgentRun,
  AgentSession,
  ApproveRunInput,
  RejectRunInput,
  RuntimeInteraction,
} from '../../../../state/shared/types.js'

export interface RuntimeInteractionApprovalResult {
  interaction: RuntimeInteraction
  run: AgentRun
}

export function materializeRuntimeApprovalInteractions(input: {
  store: Pick<AgentStore, 'createRuntimeInteraction' | 'listRuntimeInteractions'> & Partial<Pick<AgentStore, 'getSession'>>
  run: AgentRun
  approvals: AgentApprovalRequest[]
  now: string
}): RuntimeInteraction[] {
  const existing = input.store.listRuntimeInteractions({ runId: input.run.id })
  const existingByApprovalId = new Map(existing.flatMap((interaction) => {
    const payload = isRecord(interaction.payload) ? interaction.payload : {}
    return typeof payload.approvalId === 'string' ? [[payload.approvalId, interaction.id] as const] : []
  }))
  const created: RuntimeInteraction[] = []
  const interactionIdByApprovalId = new Map<string, string>()
  const session = input.run.sessionId ? input.store.getSession?.(input.run.sessionId) : undefined
  const displayThreadId = runtimeInteractionDisplayThreadId(input.run, session)
  const displayAnchor = runtimeInteractionDisplayAnchor(input.run, displayThreadId)
  for (const approval of input.approvals) {
    const existingInteractionId = existingByApprovalId.get(approval.id)
    if (existingInteractionId) {
      approval.interactionId = existingInteractionId
      approval.displayThreadId = displayThreadId
      approval.displayAnchor = displayAnchor
      interactionIdByApprovalId.set(approval.id, existingInteractionId)
      continue
    }
    approval.displayThreadId = displayThreadId
    approval.displayAnchor = displayAnchor
    const interaction: RuntimeInteraction = {
      id: `interaction_${approval.id}`,
      threadId: input.run.threadId,
      runId: input.run.id,
      ...(input.run.sessionId ? { sessionId: input.run.sessionId } : {}),
      originThreadId: input.run.threadId,
      originRunId: input.run.id,
      displayThreadId,
      displayAnchor,
      kind: 'approval',
      status: 'pending',
      payload: {
        approvalId: approval.id,
        toolName: approval.toolName,
        ...(approval.args ? { args: approval.args } : {}),
        reason: approval.reason,
        ...(approval.risk ? { risk: approval.risk } : {}),
        ...(approval.permission ? { permission: approval.permission } : {}),
      },
      createdAt: input.now,
      updatedAt: input.now,
    }
    approval.interactionId = interaction.id
    interactionIdByApprovalId.set(approval.id, interaction.id)
    input.store.createRuntimeInteraction(interaction)
    created.push(interaction)
  }
  input.run.pendingApprovals = (input.run.pendingApprovals ?? []).map((approval) => {
    const interactionId = interactionIdByApprovalId.get(approval.id)
    return interactionId ? { ...approval, interactionId, displayThreadId, displayAnchor } : approval
  })
  return created
}

function runtimeInteractionDisplayThreadId(run: AgentRun, session: AgentSession | undefined): string {
  return session?.interactiveThreadId ?? session?.rootThreadId ?? run.threadId
}

function runtimeInteractionDisplayAnchor(run: AgentRun, displayThreadId: string): RuntimeInteraction['displayAnchor'] {
  const sourceMessageId = typeof run.input?.sourceMessageId === 'string' && run.input.sourceMessageId.trim()
    ? run.input.sourceMessageId.trim()
    : undefined
  return {
    threadId: displayThreadId,
    runId: run.id,
    ...(sourceMessageId ? { messageId: sourceMessageId } : {}),
    placement: 'after',
    reason: sourceMessageId ? 'run_source_message' : 'run',
  }
}

export function approveRuntimeInteraction(input: {
  store: Pick<AgentStore, 'getRuntimeInteraction' | 'updateRuntimeInteraction' | 'listRuntimeInteractions' | 'getRun'>
  interactionId: string
  now: string
  approveRun: (runId: string, approvalInput: ApproveRunInput) => AgentRun
}): RuntimeInteractionApprovalResult {
  const interaction = requireApprovalInteraction(input.store, input.interactionId)
  if (interaction.status !== 'pending') return resolvedInteractionResult(input.store, interaction)
  const approvalId = approvalIdFromInteraction(interaction)
  const run = input.approveRun(interaction.runId, { approvalIds: [approvalId] })
  syncResolvedRuntimeApprovalInteractions(input.store, run, input.now)
  interaction.status = 'approved'
  interaction.result = { runId: run.id, runStatus: run.status }
  interaction.resolvedAt = input.now
  interaction.updatedAt = input.now
  input.store.updateRuntimeInteraction(interaction)
  return { interaction, run }
}

export function rejectRuntimeInteraction(input: {
  store: Pick<AgentStore, 'getRuntimeInteraction' | 'updateRuntimeInteraction' | 'listRuntimeInteractions' | 'getRun'>
  interactionId: string
  now: string
  rejectRun: (runId: string, rejectionInput: RejectRunInput) => AgentRun
}): RuntimeInteractionApprovalResult {
  const interaction = requireApprovalInteraction(input.store, input.interactionId)
  if (interaction.status !== 'pending') return resolvedInteractionResult(input.store, interaction)
  const approvalId = approvalIdFromInteraction(interaction)
  const run = input.rejectRun(interaction.runId, { approvalIds: [approvalId] })
  syncResolvedRuntimeApprovalInteractions(input.store, run, input.now)
  interaction.status = 'rejected'
  interaction.result = { runId: run.id, runStatus: run.status }
  interaction.resolvedAt = input.now
  interaction.updatedAt = input.now
  input.store.updateRuntimeInteraction(interaction)
  return { interaction, run }
}

function requireApprovalInteraction(
  store: Pick<AgentStore, 'getRuntimeInteraction'>,
  interactionId: string,
): RuntimeInteraction {
  const interaction = store.getRuntimeInteraction(interactionId)
  if (!interaction) throw new Error(`runtime interaction not found: ${interactionId}`)
  if (interaction.kind !== 'approval') throw new Error(`runtime interaction ${interactionId} is not an approval`)
  return interaction
}

function resolvedInteractionResult(
  store: Pick<AgentStore, 'getRun'>,
  interaction: RuntimeInteraction,
): RuntimeInteractionApprovalResult {
  const resultRunId = isRecord(interaction.result) && typeof interaction.result.runId === 'string'
    ? interaction.result.runId
    : undefined
  const run = store.getRun(resultRunId ?? interaction.runId)
  if (!run) throw new Error(`run not found: ${resultRunId ?? interaction.runId}`)
  return { interaction, run }
}

function approvalIdFromInteraction(interaction: RuntimeInteraction): string {
  const payload = isRecord(interaction.payload) ? interaction.payload : {}
  if (typeof payload.approvalId === 'string' && payload.approvalId.trim()) return payload.approvalId.trim()
  throw new Error(`runtime interaction ${interaction.id} has no approvalId`)
}

function syncResolvedRuntimeApprovalInteractions(
  store: Pick<AgentStore, 'listRuntimeInteractions' | 'updateRuntimeInteraction'>,
  run: AgentRun,
  now: string,
): void {
  const approvalsById = new Map((run.pendingApprovals ?? []).map((approval) => [approval.id, approval]))
  if (approvalsById.size === 0) return
  for (const interaction of store.listRuntimeInteractions({ runId: run.id, kind: 'approval' })) {
    if (interaction.status !== 'pending') continue
    const approvalId = approvalIdFromInteraction(interaction)
    const approval = approvalsById.get(approvalId)
    if (!approval || approval.status === 'pending') continue
    store.updateRuntimeInteraction({
      ...interaction,
      status: approval.status,
      result: { runId: run.id, runStatus: run.status },
      resolvedAt: approval.approvedAt ?? approval.rejectedAt ?? now,
      updatedAt: now,
    })
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
